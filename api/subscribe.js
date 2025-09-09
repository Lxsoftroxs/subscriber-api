// api/subscribe.js
// Vercel serverless (Node) — works with @octokit/rest v18
const { Octokit } = require("@octokit/rest");

// ---- Config ----
const OWNER  = "lxsoftroxs";
const REPO   = "lxsoftroxs.github.io";
const FILE   = "subscribers.json";
const BRANCH = "main";

// Optional envs:
// GITHUB_TOKEN  -> required, fine-grained PAT with contents:write on the repo
// ALLOWED_ORIGIN -> if set, used for CORS (else "*")
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isValidEmail(s) {
  return typeof s === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

async function readJsonBody(req) {
  // Vercel often gives you an object for JSON; sometimes it's a string
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  // Fallback: read raw stream
  let raw = "";
  await new Promise((resolve) => {
    req.on("data", (c) => (raw += c));
    req.on("end", resolve);
  });
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

async function getFile(octokit) {
  try {
    const { data } = await octokit.repos.getContent({
      owner: OWNER, repo: REPO, path: FILE, ref: BRANCH,
    });
    const decoded = Buffer.from(data.content, data.encoding).toString("utf8");
    let parsed = [];
    try {
      parsed = JSON.parse(decoded);
      // If someone committed { subscribers: [...] }, migrate
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.subscribers)) {
        parsed = parsed.subscribers;
      }
    } catch {
      parsed = [];
    }
    return { list: parsed, sha: data.sha };
  } catch (e) {
    // 404 → start fresh
    return { list: [], sha: null };
  }
}

async function putFile(octokit, list, sha) {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString("base64");
  return octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: FILE,
    message: "chore(subscribers): +1",
    content,
    branch: BRANCH,
    sha: sha || undefined,
  });
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // Require token
  if (!process.env.GITHUB_TOKEN) {
    return res.status(500).json({ message: "Server not configured (missing GITHUB_TOKEN)" });
  }

  const body = await readJsonBody(req);
  const emailRaw = (body.email || "").toString().trim().toLowerCase();

  if (!isValidEmail(emailRaw)) {
    return res.status(400).json({ message: "Invalid email" });
  }

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  // 1) Read current list
  let { list, sha } = await getFile(octokit);

  // 2) Normalize: keep only valid emails, lowercase+unique
  const set = new Set(
    (Array.isArray(list) ? list : [])
      .map(String)
      .map((s) => s.trim().toLowerCase())
      .filter(isValidEmail)
  );

  if (set.has(emailRaw)) {
    return res.status(200).json({ message: "You're already subscribed!" });
  }

  set.add(emailRaw);

  // Keep it sorted for stable diffs
  const nextList = Array.from(set).sort();

  // 3) Try to write; if a concurrent write happens, refetch and retry once
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await putFile(octokit, nextList, sha);
      return res.status(200).json({ message: "Subscribed successfully!" });
    } catch (err) {
      // 409 = sha mismatch (someone else updated); refetch
      if (err && (err.status === 409 || err.status === 422)) {
        const refetched = await getFile(octokit);
        sha = refetched.sha;
        // merge again in case new emails were added
        const merged = new Set(
          (Array.isArray(refetched.list) ? refetched.list : [])
            .map(String).map((s) => s.trim().toLowerCase()).filter(isValidEmail)
        );
        for (const e of nextList) merged.add(e);
        list = Array.from(merged).sort();
        continue;
      }
      console.error("Update failed:", err);
      return res.status(500).json({ message: "Failed to update subscribers." });
    }
  }

  // If we somehow got here, last retry failed too
  return res.status(500).json({ message: "Failed to update subscribers (retry)." });
};

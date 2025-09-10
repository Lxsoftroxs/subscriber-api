// api/tetris.js — Global Tetris leaderboard via GitHub file
const { Octokit } = require("@octokit/rest");

const OWNER  = "lxsoftroxs";
const REPO   = "lxsoftroxs.github.io";
const FILE   = "tetris_scores.json";
const BRANCH = "main";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://lxsoftroxs.github.io";
const MAX_NAME_LEN = 16;
const MAX_SCORES   = 100;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}
const okName  = (s) => typeof s === "string" && s.trim().length && s.trim().length <= MAX_NAME_LEN;
const okScore = (n) => Number.isFinite(n) && n >= 0 && n <= 9_999_999;

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch {} }
  let raw = ""; await new Promise(r => (req.on("data", c => raw += c), req.on("end", r)));
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

async function getFile(octokit) {
  try {
    const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: FILE, ref: BRANCH });
    const decoded = Buffer.from(data.content, data.encoding).toString("utf8");
    let list = []; try { list = JSON.parse(decoded); } catch {}
    if (!Array.isArray(list)) list = [];
    return { list, sha: data.sha };
  } catch {
    return { list: [], sha: null };
  }
}

async function putFile(octokit, list, sha) {
  const content = Buffer.from(JSON.stringify(list, null, 2)).toString("base64");
  return octokit.repos.createOrUpdateFileContents({
    owner: OWNER, repo: REPO, path: FILE, branch: BRANCH,
    message: "chore(tetris): leaderboard update",
    content, sha: sha || undefined,
  });
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!process.env.GITHUB_TOKEN) {
    return res.status(500).json({ message: "Server missing GITHUB_TOKEN" });
  }
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  if (req.method === "GET") {
    const { list } = await getFile(octokit);
    const top = list
      .filter(e => okName(e.name) && okScore(e.score))
      .sort((a,b)=> (b.score - a.score) || (a.ts - b.ts))
      .slice(0, 10);
    return res.status(200).json({ leaderboard: top });
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const name  = (body.name || "").toString().trim().slice(0, MAX_NAME_LEN);
    const score = Number(body.score);
    if (!okName(name) || !okScore(score)) {
      return res.status(400).json({ message: "Invalid name or score" });
    }

    // merge + retry on SHA conflict
    let { list, sha } = await getFile(octokit);
    list.push({ name, score, ts: Date.now() });
    list = list
      .filter(e => okName(e.name) && okScore(e.score))
      .sort((a,b)=> (b.score - a.score) || (a.ts - b.ts))
      .slice(0, MAX_SCORES);

    for (let attempt=0; attempt<2; attempt++) {
      try {
        await putFile(octokit, list, sha);
        return res.status(200).json({ message: "Saved", leaderboard: list.slice(0,10) });
      } catch (e) {
        if (e && (e.status === 409 || e.status === 422)) {
          const ref = await getFile(octokit);
          sha = ref.sha;
          const merged = [...ref.list, { name, score, ts: Date.now() }];
          list = merged
            .filter(e => okName(e.name) && okScore(e.score))
            .sort((a,b)=> (b.score - a.score) || (a.ts - b.ts))
            .slice(0, MAX_SCORES);
          continue;
        }
        return res.status(500).json({ message: "Write failed" });
      }
    }
    return res.status(500).json({ message: "Write failed (retry)" });
  }

  return res.status(405).json({ message: "Method Not Allowed" });
};

const { Octokit } = require("@octokit/rest");

const OWNER = "lxsoftroxs";
const REPO = "lxsoftroxs.github.io";
const FILE_PATH = "subscribers.json";
const BRANCH = "main";

module.exports = async (req, res) => {
  // 1. Handle OPTIONS (CORS Preflight)
  if (req.method === "OPTIONS") {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end(); // End the response here
  }

  // 2. For all other methods except POST, return 405
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // 3. Set CORS headers for the actual POST response as well
  res.setHeader("Access-Control-Allow-Origin", "*");

  // 4. Now handle your subscription logic
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // Initialize Octokit
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  let subscribers = [];
  let sha = null;

  try {
    const { data } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: FILE_PATH,
      ref: BRANCH,
    });
    subscribers = JSON.parse(Buffer.from(data.content, data.encoding).toString());
    sha = data.sha;
  } catch (error) {
    // If file not found, use an empty array
    subscribers = [];
  }

  if (subscribers.includes(email)) {
    return res.status(200).json({ message: "You're already subscribed!" });
  }

  subscribers.push(email);
  const content = Buffer.from(JSON.stringify(subscribers, null, 2)).toString("base64");

  try {
    await octokit.repos.createOrUpdateFileContents({
      owner: OWNER,
      repo: REPO,
      path: FILE_PATH,
      message: `Add subscriber ${email}`,
      content,
      branch: BRANCH,
      sha: sha || undefined,
    });
    return res.status(200).json({ message: "Subscribed successfully!" });
  } catch (error) {
    console.error("Error updating subscribers:", error.message);
    return res.status(500).json({ message: "Failed to update subscribers." });
  }
};

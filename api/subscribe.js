// api/subscribe.js
const { Octokit } = require("@octokit/rest");

const OWNER = "lxsoftroxs";              // Your GitHub username
const REPO = "lxsoftroxs.github.io";       // Your GitHub Pages repository name
const FILE_PATH = "subscribers.json";      // File path in your repo root
const BRANCH = "main";                     // Adjust if your default branch is different

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  
  // Initialize Octokit with your GitHub token
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
    // If file doesn't exist, assume empty list
    console.log("No subscribers.json found, starting with empty list.");
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

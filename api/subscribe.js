// api/subscribe.js
const { Octokit } = require("@octokit/rest");

const OWNER = "lxsoftroxs";              // Your GitHub username
const REPO = "lxsoftroxs.github.io";       // Your GitHub Pages repository name
const FILE_PATH = "subscribers.json";      // The file storing subscriber emails (in repo root)
const BRANCH = "main";                     // Your default branch

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  
  // Initialize Octokit with your GitHub token (set as an environment variable in Vercel)
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  
  let subscribers = [];
  let sha = null;
  
  try {
    // Try to get the existing subscribers.json file from your repo
    const { data } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: FILE_PATH,
      ref: BRANCH,
    });
    subscribers = JSON.parse(Buffer.from(data.content, data.encoding).toString());
    sha = data.sha;
  } catch (error) {
    // If the file doesn't exist, start with an empty array
    subscribers = [];
  }
  
  // If email is already subscribed, return a message
  if (subscribers.includes(email)) {
    return res.status(200).json({ message: "You're already subscribed!" });
  }
  
  // Add the new email
  subscribers.push(email);
  
  // Convert the updated array to Base64 string
  const content = Buffer.from(JSON.stringify(subscribers, null, 2)).toString("base64");
  
  try {
    // Update or create the subscribers.json file in your repository
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
    console.error(error);
    return res.status(500).json({ message: "Failed to update subscribers." });
  }
};

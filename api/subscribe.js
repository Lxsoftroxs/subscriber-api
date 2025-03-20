const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const OWNER = "lxsoftroxs";
const REPO = "lxsoftroxs.github.io";
const FILE_PATH = "subscribers.json";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed." });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Please provide a valid email." });
  }

  try {
    let sha = null;
    let subscribers = [];

    try {
      const { data } = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: FILE_PATH });
      subscribers = JSON.parse(Buffer.from(data.content, "base64").toString());
      sha = data.sha;
    } catch {}

    if (subscribers.includes(email)) {
      return res.json({ message: "You're already subscribed!" });
    }

    subscribers.push(email);

    await octokit.repos.createOrUpdateFileContents({
      owner: OWNER,
      repo: REPO,
      path: FILE_PATH,
      message: "New subscriber added",
      content: Buffer.from(JSON.stringify(subscribers)).toString("base64"),
      sha
    });

    return res.json({ message: "Subscribed successfully!" });

  } catch (err) {
    return res.status(500).json({ message: "Something went wrong." });
  }
};

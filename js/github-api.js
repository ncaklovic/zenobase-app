// Minimal client for reading/writing files in the private data repo via
// GitHub's REST API, using a personal access token stored only in this
// browser's localStorage. See CORS notes in README for why this specific
// approach (api.github.com, not raw.githubusercontent.com) was chosen.

const GH_TOKEN_KEY = "zenobase_gh_pat";

function getGitHubToken() {
  return localStorage.getItem(GH_TOKEN_KEY) || "";
}

function setGitHubToken(token) {
  localStorage.setItem(GH_TOKEN_KEY, token.trim());
}

function hasGitHubToken() {
  return !!getGitHubToken();
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function apiUrl(path) {
  const { owner, name } = CONFIG.dataRepo;
  return `https://api.github.com/repos/${owner}/${name}/contents/${path}`;
}

function authHeaders(extra) {
  return {
    Authorization: `Bearer ${getGitHubToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

/**
 * Fetch raw text content of a file in the data repo.
 * Returns null if the file doesn't exist (404).
 */
async function ghGetRawText(path) {
  const url = `${apiUrl(path)}?ref=${CONFIG.dataRepo.branch}`;
  const res = await fetch(url, {
    headers: authHeaders({ Accept: "application/vnd.github.raw+json" }),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to read ${path}: ${res.status} ${await res.text()}`);
  }
  return res.text();
}

/**
 * Fetch just the current sha of a file (needed to update it), without
 * pulling its full content. Returns null if the file doesn't exist.
 */
async function ghGetSha(path) {
  const url = `${apiUrl(path)}?ref=${CONFIG.dataRepo.branch}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to get sha for ${path}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.sha;
}

/**
 * Create or update a file in the data repo.
 */
async function ghPutFile(path, contentStr, message) {
  const sha = await ghGetSha(path);
  const body = {
    message,
    content: utf8ToBase64(contentStr),
    branch: CONFIG.dataRepo.branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to write ${path}: ${res.status} ${err.message || ""}`);
  }
  return res.json();
}

/** Quick sanity check that the stored token actually works. */
async function ghVerifyToken() {
  const res = await fetch("https://api.github.com/user", { headers: authHeaders() });
  if (!res.ok) return { ok: false, status: res.status };
  const user = await res.json();
  return { ok: true, login: user.login };
}

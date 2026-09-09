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

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
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
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to read ${path}: ${res.status} ${await res.text()}`);
  }
  return res.text();
}

/**
 * Fetch a small file's content AND sha together, in one request, so a
 * subsequent write can be checked against the exact version we read -
 * not a separately-fetched (possibly newer) sha. Only use this for files
 * under ~1MB (the manual_*.json files this app owns); large read-only
 * files should use ghGetRawText instead.
 *
 * `cache: "no-store"` matters here specifically because this hits the same
 * URL as ghGetRawText (same path+ref), just with a different Accept header
 * (JSON wrapper vs. raw file bytes). A cached raw response getting reused
 * for this request would make `res.json()` parse the file's own JSON
 * content as `data` instead of the expected `{content, sha}` object -
 * `data.content`/`data.sha` would then silently be undefined. Confirmed
 * this can happen on this network (TLS-inspecting corporate proxy, see
 * CLAUDE.md) even for small files well under any size limit.
 * Returns null if the file doesn't exist.
 */
async function ghGetFileWithSha(path) {
  const url = `${apiUrl(path)}?ref=${CONFIG.dataRepo.branch}`;
  const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to read ${path}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // `sha` is always present in the JSON-wrapper response; `content` is
  // additionally omitted by GitHub once a file crosses ~1MB (same limit
  // noted for trakt_full.json / lastfm_full.json) - fall back to a raw
  // fetch for content only, still paired with the sha from this response.
  if (data.content) {
    return { content: base64ToUtf8(data.content), sha: data.sha };
  }
  const content = await ghGetRawText(path);
  return { content, sha: data.sha };
}

/**
 * Create or update a file in the data repo. `sha` must be the sha of the
 * exact version this write is based on (null only when creating a file
 * that doesn't exist yet) - GitHub rejects the write with a 409 if the
 * file has changed since, rather than silently overwriting it.
 */
async function ghPutFile(path, contentStr, message, sha) {
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
  if (res.status === 409) {
    const err = new Error(`Conflict writing ${path}: file changed since it was read`);
    err.isConflict = true;
    throw err;
  }
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

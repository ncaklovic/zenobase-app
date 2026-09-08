// Shared "settings" panel: lets the user paste in their GitHub PAT
// (fine-grained, scoped to just the zenobase repo, Contents: Read & Write)
// and TMDB API key. Both are stored only in this browser's localStorage -
// never sent anywhere except directly to GitHub/TMDB's own APIs.

function initSettingsPanel() {
  const panel = document.getElementById("settings-panel");
  const openBtn = document.getElementById("settings-open");
  const closeBtn = document.getElementById("settings-close");
  const ghInput = document.getElementById("gh-token-input");
  const tmdbInput = document.getElementById("tmdb-key-input");
  const saveBtn = document.getElementById("settings-save");
  const status = document.getElementById("settings-status");

  ghInput.value = getGitHubToken();
  tmdbInput.value = getTmdbKey();

  openBtn.addEventListener("click", () => panel.classList.remove("hidden"));
  closeBtn.addEventListener("click", () => panel.classList.add("hidden"));

  saveBtn.addEventListener("click", async () => {
    setGitHubToken(ghInput.value);
    setTmdbKey(tmdbInput.value);
    status.textContent = "Checking GitHub token...";
    try {
      const result = await ghVerifyToken();
      status.textContent = result.ok
        ? `Saved. Authenticated as ${result.login}.`
        : `Saved, but GitHub token check failed (status ${result.status}).`;
    } catch (e) {
      status.textContent = `Saved, but couldn't verify: ${e.message}`;
    }
  });

  if (!hasGitHubToken()) {
    panel.classList.remove("hidden");
  }
}

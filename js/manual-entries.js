// Shared read-modify-write helpers for the two manual_*.json files this
// app owns (data/manual_watched.json, data/manual_books.json). Included on
// both add.html (append) and index.html (delete) - see CLAUDE.md's note
// about shared script dependencies needing to be on every page that uses
// them.

function makeManualId() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function appendToManualFile(path, entry, commitMessage, attempt = 1) {
  const existing = await ghGetFileWithSha(path);
  const items = existing ? JSON.parse(existing.content) : [];
  const updated = [entry, ...items];
  try {
    await ghPutFile(path, JSON.stringify(updated, null, 2), commitMessage, existing?.sha);
  } catch (err) {
    // Someone else wrote to this file between our read and our write
    // (e.g. two tabs, or a double-submit). Re-read the latest version
    // and try again rather than risk losing what changed in between.
    if (err.isConflict && attempt < 5) {
      return appendToManualFile(path, entry, commitMessage, attempt + 1);
    }
    throw err;
  }
}

/**
 * Remove the first raw entry matching `predicate` from the manual file at
 * `path`. `predicate` runs against entries in their raw on-disk shape (not
 * the normalized dashboard shape data-service.js produces) - see callers
 * for what that looks like per file. Retries against a fresh re-read on a
 * write conflict, same reasoning as appendToManualFile above. Returns
 * false (no-op) if the file doesn't exist or nothing matched - e.g. it was
 * already deleted from another tab.
 */
async function removeFromManualFile(path, predicate, commitMessage, attempt = 1) {
  const existing = await ghGetFileWithSha(path);
  if (!existing) return false;
  const items = JSON.parse(existing.content);
  const idx = items.findIndex(predicate);
  if (idx === -1) return false;
  items.splice(idx, 1);
  try {
    await ghPutFile(path, JSON.stringify(items, null, 2), commitMessage, existing.sha);
    return true;
  } catch (err) {
    if (err.isConflict && attempt < 5) {
      return removeFromManualFile(path, predicate, commitMessage, attempt + 1);
    }
    throw err;
  }
}

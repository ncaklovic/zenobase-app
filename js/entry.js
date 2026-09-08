// "Add entry" page logic: search-as-you-type against TMDB/Open Library,
// pick a result, fill in a date (+ rating for books), save - which reads
// the current manual_*.json, appends the new record, and writes it back.

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combine a <input type=date> value and <input type=time> value (both
 * local, no timezone info) into an ISO timestamp reflecting local time. */
function localDateTimeToIso(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr || "00:00"}:00`).toISOString();
}

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

// ---------- Movies ----------

function initMovieForm() {
  const searchInput = document.getElementById("movie-search");
  const resultsEl = document.getElementById("movie-results");
  const form = document.getElementById("movie-save-form");
  const dateInput = document.getElementById("movie-date");
  const timeInput = document.getElementById("movie-time");
  const selectedLabel = document.getElementById("movie-selected");
  const statusEl = document.getElementById("movie-status");
  dateInput.value = todayStr();
  timeInput.value = nowTimeStr();

  let selected = null;

  searchInput.addEventListener(
    "input",
    debounce(async () => {
      const q = searchInput.value.trim();
      resultsEl.innerHTML = "";
      if (!q) return;
      try {
        const results = await tmdbSearchMovie(q);
        for (const m of results.slice(0, 8)) {
          const li = document.createElement("li");
          li.textContent = `${m.title}${m.year ? ` (${m.year})` : ""}`;
          li.addEventListener("click", () => {
            selected = m;
            selectedLabel.textContent = `Selected: ${m.title}${m.year ? ` (${m.year})` : ""}`;
            resultsEl.innerHTML = "";
            searchInput.value = "";
          });
          resultsEl.appendChild(li);
        }
      } catch (e) {
        statusEl.textContent = `Search failed: ${e.message}`;
      }
    }, 350)
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) {
      statusEl.textContent = "Pick a movie from the search results first.";
      return;
    }
    statusEl.textContent = "Saving...";
    try {
      const ext = await tmdbMovieExternalIds(selected.tmdbId);
      const entry = {
        id: makeManualId(),
        watched_at: localDateTimeToIso(dateInput.value, timeInput.value),
        action: "watch",
        type: "movie",
        movie: {
          title: selected.title,
          year: selected.year,
          ids: {
            tmdb: selected.tmdbId,
            imdb: ext.imdb_id || null,
          },
        },
      };
      await appendToManualFile(
        CONFIG.paths.manualWatched,
        entry,
        `Add movie: ${selected.title}`
      );
      statusEl.textContent = `Saved: ${selected.title}`;
      selected = null;
      selectedLabel.textContent = "";
    } catch (err) {
      statusEl.textContent = `Save failed: ${err.message}`;
    }
  });
}

// ---------- TV episodes ----------

function initTvForm() {
  const searchInput = document.getElementById("tv-search");
  const resultsEl = document.getElementById("tv-results");
  const form = document.getElementById("tv-save-form");
  const dateInput = document.getElementById("tv-date");
  const timeInput = document.getElementById("tv-time");
  const seasonInput = document.getElementById("tv-season");
  const episodeInput = document.getElementById("tv-episode");
  const selectedLabel = document.getElementById("tv-selected");
  const statusEl = document.getElementById("tv-status");
  dateInput.value = todayStr();
  timeInput.value = nowTimeStr();

  let selectedShow = null;

  searchInput.addEventListener(
    "input",
    debounce(async () => {
      const q = searchInput.value.trim();
      resultsEl.innerHTML = "";
      if (!q) return;
      try {
        const results = await tmdbSearchShow(q);
        for (const s of results.slice(0, 8)) {
          const li = document.createElement("li");
          li.textContent = `${s.title}${s.year ? ` (${s.year})` : ""}`;
          li.addEventListener("click", () => {
            selectedShow = s;
            selectedLabel.textContent = `Show: ${s.title}${s.year ? ` (${s.year})` : ""}`;
            resultsEl.innerHTML = "";
            searchInput.value = "";
          });
          resultsEl.appendChild(li);
        }
      } catch (e) {
        statusEl.textContent = `Search failed: ${e.message}`;
      }
    }, 350)
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedShow) {
      statusEl.textContent = "Pick a show from the search results first.";
      return;
    }
    const season = Number(seasonInput.value);
    const number = Number(episodeInput.value);
    if (!season || !number) {
      statusEl.textContent = "Enter a season and episode number.";
      return;
    }
    statusEl.textContent = "Saving...";
    try {
      const [ep, showExt, epExt] = await Promise.all([
        tmdbGetEpisode(selectedShow.tmdbId, season, number),
        tmdbShowExternalIds(selectedShow.tmdbId),
        tmdbEpisodeExternalIds(selectedShow.tmdbId, season, number),
      ]);
      const entry = {
        id: makeManualId(),
        watched_at: localDateTimeToIso(dateInput.value, timeInput.value),
        action: "watch",
        type: "episode",
        episode: {
          season,
          number,
          title: ep?.title || "",
          ids: {
            tmdb: null,
            imdb: epExt.imdb_id || null,
          },
        },
        show: {
          title: selectedShow.title,
          year: selectedShow.year,
          ids: {
            tmdb: selectedShow.tmdbId,
            imdb: showExt.imdb_id || null,
            tvdb: showExt.tvdb_id || null,
          },
        },
      };
      await appendToManualFile(
        CONFIG.paths.manualWatched,
        entry,
        `Add episode: ${selectedShow.title} S${season}E${number}`
      );
      statusEl.textContent = `Saved: ${selectedShow.title} S${season}E${number}`;
      selectedShow = null;
      selectedLabel.textContent = "";
      seasonInput.value = "";
      episodeInput.value = "";
    } catch (err) {
      statusEl.textContent = `Save failed: ${err.message}`;
    }
  });
}

// ---------- Books ----------

function initBookForm() {
  const searchInput = document.getElementById("book-search");
  const resultsEl = document.getElementById("book-results");
  const form = document.getElementById("book-save-form");
  const dateInput = document.getElementById("book-date");
  const ratingInput = document.getElementById("book-rating");
  const selectedLabel = document.getElementById("book-selected");
  const statusEl = document.getElementById("book-status");
  dateInput.value = todayStr();

  let selected = null;

  searchInput.addEventListener(
    "input",
    debounce(async () => {
      const q = searchInput.value.trim();
      resultsEl.innerHTML = "";
      if (!q) return;
      try {
        const results = await openLibrarySearch(q);
        for (const b of results.slice(0, 8)) {
          const li = document.createElement("li");
          li.textContent = `${b.title} - ${b.author}${b.year ? ` (${b.year})` : ""}`;
          li.addEventListener("click", () => {
            selected = b;
            selectedLabel.textContent = `Selected: ${b.title} - ${b.author}`;
            resultsEl.innerHTML = "";
            searchInput.value = "";
          });
          resultsEl.appendChild(li);
        }
      } catch (e) {
        statusEl.textContent = `Search failed: ${e.message}`;
      }
    }, 350)
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) {
      statusEl.textContent = "Pick a book from the search results first.";
      return;
    }
    statusEl.textContent = "Saving...";
    try {
      const entry = {
        title: selected.title,
        author: selected.author,
        date_read: dateInput.value,
        rating: ratingInput.value ? Number(ratingInput.value) : null,
        ids: { openlibrary: selected.olKey, isbn: selected.isbn },
      };
      await appendToManualFile(
        CONFIG.paths.manualBooks,
        entry,
        `Add book: ${selected.title}`
      );
      statusEl.textContent = `Saved: ${selected.title}`;
      selected = null;
      selectedLabel.textContent = "";
      ratingInput.value = "";
    } catch (err) {
      statusEl.textContent = `Save failed: ${err.message}`;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initSettingsPanel();
  initMovieForm();
  initTvForm();
  initBookForm();
});

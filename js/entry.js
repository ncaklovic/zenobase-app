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

// makeManualId() and appendToManualFile() live in manual-entries.js,
// shared with dashboard.js's delete flow - see that file's header comment.

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

const CONTINUE_MAX_SHOWS = 40;

const epAfter = (a, b) => a.season > b.season || (a.season === b.season && a.number > b.number);

/** Groups watched episodes by show (most recently watched first) and records
 * the furthest episode watched per show. Shows without a TMDB id (can't look
 * up what comes next) and specials (season 0) are skipped. */
function recentShowsFromWatched(watched) {
  const byShow = new Map();
  for (const w of watched) {
    if (w.type !== "episode" || !w.showIds?.tmdb || !w.season || !w.number) continue;
    let s = byShow.get(w.showIds.tmdb);
    if (!s) {
      // `watched` is newest-first, so the first hit is the latest watch.
      s = { tmdbId: w.showIds.tmdb, title: w.showTitle, year: w.year, lastWatchedAt: w.watchedAt, furthest: w };
      byShow.set(w.showIds.tmdb, s);
    } else if (epAfter(w, s.furthest)) {
      s.furthest = w;
    }
  }
  return [...byShow.values()];
}

/** The episode after `furthest`, or null if the show has nothing more that
 * has already aired. */
function nextAiredEpisode(furthest, details) {
  if (!details || !details.lastAired) return null;
  const cur = details.seasons.find((s) => s.season === furthest.season);
  let next;
  if (cur && furthest.number < cur.episodeCount) {
    next = { season: furthest.season, number: furthest.number + 1 };
  } else {
    const later = details.seasons
      .filter((s) => s.season > furthest.season && s.episodeCount > 0)
      .sort((a, b) => a.season - b.season)[0];
    if (!later) return null;
    next = { season: later.season, number: 1 };
  }
  const { lastAired } = details;
  const aired = !epAfter(next, lastAired);
  return aired ? next : null;
}

/** Fills the "Continue watching" list: recently watched shows that have a
 * next, already-aired episode, newest first. `onPick(show, next)` is called
 * when one is clicked. */
async function loadContinueWatching(listEl, statusEl, onPick) {
  listEl.innerHTML = "";
  if (!hasGitHubToken() || !getTmdbKey()) {
    statusEl.textContent = "Add your GitHub token and TMDB key in Settings to see shows to continue.";
    return;
  }
  statusEl.textContent = "Checking your recent shows...";
  try {
    const shows = recentShowsFromWatched(await loadWatched()).slice(0, CONTINUE_MAX_SHOWS);
    const details = await Promise.all(shows.map((s) => tmdbGetShowDetails(s.tmdbId)));
    let count = 0;
    shows.forEach((show, i) => {
      const next = nextAiredEpisode(show.furthest, details[i]);
      if (!next) return;
      count++;
      const li = document.createElement("li");
      const code = `S${String(next.season).padStart(2, "0")}E${String(next.number).padStart(2, "0")}`;
      li.title = `${show.title} - last watched ${show.lastWatchedAt.toISOString().slice(0, 10)}`;
      const name = document.createElement("span");
      name.className = "continue-name";
      name.textContent = show.title;
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = code;
      li.append(name, badge);
      li.addEventListener("click", () => onPick(show, next));
      listEl.appendChild(li);
    });
    statusEl.textContent = count ? "" : "No recently watched shows have unwatched episodes.";
  } catch (e) {
    statusEl.textContent = `Couldn't load shows: ${e.message}`;
  }
}

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

  const continueEl = document.getElementById("tv-continue");
  const continueStatusEl = document.getElementById("tv-continue-status");
  const refreshContinue = () =>
    loadContinueWatching(continueEl, continueStatusEl, (show, next) => {
      selectedShow = { title: show.title, year: show.year, tmdbId: show.tmdbId };
      selectedLabel.textContent = `Show: ${show.title}${show.year ? ` (${show.year})` : ""}`;
      seasonInput.value = next.season;
      episodeInput.value = next.number;
      dateInput.value = todayStr();
      timeInput.value = nowTimeStr();
      statusEl.textContent = "";
      form.querySelector("button[type=submit]").focus();
    });
  refreshContinue();
  document.addEventListener("zenobase:settings-saved", refreshContinue);

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
      refreshContinue(); // so the show's next episode moves up the list
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
        id: makeManualId(),
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

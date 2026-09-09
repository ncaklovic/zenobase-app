// TMDB (themoviedb.org) client - used for movie/show metadata lookup when
// adding entries. Free API, requires a key the user supplies (stored only
// in this browser's localStorage, same pattern as the GitHub token).

const TMDB_KEY_STORAGE = "zenobase_tmdb_key";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w92";

function getTmdbKey() {
  return localStorage.getItem(TMDB_KEY_STORAGE) || "";
}

function setTmdbKey(key) {
  // sanitizeSecret is defined in github-api.js, loaded before this file on
  // every page (see CLAUDE.md's shared-script-dependency gotcha).
  localStorage.setItem(TMDB_KEY_STORAGE, sanitizeSecret(key));
}

async function tmdbSearchMovie(query) {
  const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(query)}&api_key=${getTmdbKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB movie search failed: ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((m) => ({
    title: m.title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    tmdbId: m.id,
    poster: m.poster_path ? TMDB_IMG_BASE + m.poster_path : null,
  }));
}

async function tmdbSearchShow(query) {
  const url = `${TMDB_BASE}/search/tv?query=${encodeURIComponent(query)}&api_key=${getTmdbKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB show search failed: ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((s) => ({
    title: s.name,
    year: s.first_air_date ? Number(s.first_air_date.slice(0, 4)) : null,
    tmdbId: s.id,
    poster: s.poster_path ? TMDB_IMG_BASE + s.poster_path : null,
  }));
}

async function tmdbGetEpisode(showId, season, episode) {
  const url = `${TMDB_BASE}/tv/${showId}/season/${season}/episode/${episode}?api_key=${getTmdbKey()}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const e = await res.json();
  return { title: e.name, season: e.season_number, number: e.episode_number };
}

/** Full external IDs (imdb/tvdb) for a movie, fetched only at save time. */
async function tmdbMovieExternalIds(tmdbId) {
  const url = `${TMDB_BASE}/movie/${tmdbId}/external_ids?api_key=${getTmdbKey()}`;
  const res = await fetch(url);
  if (!res.ok) return {};
  return res.json();
}

async function tmdbShowExternalIds(tmdbId) {
  const url = `${TMDB_BASE}/tv/${tmdbId}/external_ids?api_key=${getTmdbKey()}`;
  const res = await fetch(url);
  if (!res.ok) return {};
  return res.json();
}

async function tmdbEpisodeExternalIds(showId, season, episode) {
  const url = `${TMDB_BASE}/tv/${showId}/season/${season}/episode/${episode}/external_ids?api_key=${getTmdbKey()}`;
  const res = await fetch(url);
  if (!res.ok) return {};
  return res.json();
}

// Central configuration for zenobase-app.
// The actual personal data lives in the private "zenobase" repo; this app
// (public, static, no personal data ever committed here) reads/writes it
// at runtime through the GitHub API, authenticated with a token the user
// supplies and that stays only in their own browser's localStorage.
const CONFIG = {
  dataRepo: {
    owner: "ncaklovic",
    name: "zenobase",
    branch: "main",
  },
  paths: {
    trakt: "data/trakt_full.json",           // cron-owned, movies + episodes
    lastfm: "data/lastfm_full.json",         // cron-owned, music (read-only in this app)
    goodreads: "data/goodreads_library_export.csv", // one-time import, books
    manualWatched: "data/manual_watched.json", // app-owned, manual movie/episode entries
    manualBooks: "data/manual_books.json",     // app-owned, manual book entries
  },
};

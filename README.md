# zenobase-app

A static personal media dashboard + entry form for movies, TV, books, and music.

This repo is public and contains **no personal data** — it's app code only.
All actual history lives in the private `zenobase` repo and is read/written
at runtime through the GitHub API, authenticated with a token that stays in
your own browser's `localStorage`.

## Setup

1. **GitHub token**: create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
   scoped to **only the `zenobase` repo** (not this one), with **Contents: Read and write** permission.
   Paste it into Settings on first load.
2. **TMDB API key**: register a free key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api),
   paste it into Settings. Used for movie/TV search only - books use Open Library, which needs no key.
3. **GitHub Pages**: in this repo's Settings → Pages, set Source to "Deploy from a branch", branch `main`, folder `/ (root)`.

## Data model

- `data/trakt_full.json`, `data/lastfm_full.json`, `data/goodreads_library_export.csv` -
  owned by the `zenobase` repo's existing sync pipeline, read-only from this app.
- `data/manual_watched.json`, `data/manual_books.json` - owned by this app,
  created automatically on first entry saved. Same schema Trakt uses for
  `manual_watched.json` (`type: "movie" | "episode"`) so the dashboard can
  merge both sources transparently.

## Why a separate repo

GitHub Pages can't be published from a private repository on the free plan,
and even on a paid plan the published site itself is still publicly
reachable by URL - only the source stays private. Since `zenobase` holds
real personal history, it stays private; this repo holds only app code, so
making it public (required for free Pages) exposes nothing.

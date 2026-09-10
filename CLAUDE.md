# zenobase-app

Static personal media dashboard + entry forms (movies, TV, books; music is
read-only). Public repo, GitHub Pages, **zero personal data ever committed
here** - all real history lives in the private `ncaklovic/zenobase` repo
and is read/written at runtime via the GitHub API.

## Why two repos

`zenobase` (data) must stay private. GitHub Pages can't publish from a
private repo on the free plan, and even on a paid plan the *published site*
is still publicly reachable by URL regardless of source-repo privacy - only
GitHub Enterprise Cloud can restrict that. So: this repo holds only app
code (safe to be public, free Pages), and the data repo stays private,
accessed at runtime through an authenticated API call using a token that
lives only in the browser's `localStorage`.

## How reads/writes actually work

No backend. Everything goes through `api.github.com`'s Contents API,
authenticated with a fine-grained PAT the user pastes into Settings.

- **Reads** use `Accept: application/vnd.github.raw+json` on the Contents
  GET endpoint - required because the default JSON response omits `content`
  for files over ~1MB (trakt_full.json and lastfm_full.json both exceed
  that). `raw.githubusercontent.com` was tried first and rejected: its CORS
  preflight returns 403 with no `Access-Control-Allow-Headers`, so it can't
  actually accept an `Authorization` header from browser JS - confirmed
  empirically, not assumed. `api.github.com` was verified to properly
  support authenticated cross-origin requests (CORS preflight returns
  `Access-Control-Allow-Origin: *` + `Authorization` in allowed headers).
- **Writes** (`ghPutFile` in `js/github-api.js`) require the caller to pass
  the exact `sha` the write is based on. `ghGetFileWithSha` fetches
  content + sha in *one* atomic request specifically so this holds - an
  earlier version fetched them as two separate calls, which meant a
  concurrent edit (two tabs, a double-click) could silently overwrite
  whatever changed in between. Now GitHub rejects a stale write with 409,
  and `appendToManualFile` (in `js/entry.js`) automatically re-reads and
  retries up to 5 times. Don't reintroduce a two-call read/write split.

## Data ownership - who writes which file

| File | Owner | This app's access |
|---|---|---|
| `data/trakt_full.json` | `zenobase`'s cron (`main.py`) | read-only |
| `data/lastfm_full.json` | `zenobase`'s cron (`main.py`) | read-only |
| `data/goodreads_reads_full.json` | manual, `zenobase`'s `scripts/scrape_goodreads_reads.py` | read-only |
| `data/manual_watched.json` | **this app** | read + write |
| `data/manual_books.json` | **this app** | read + write |

Manual movie/episode entries use the *same shape* Trakt's API returns
(`type: "movie" | "episode"`, `movie{}`/`episode{}`+`show{}`) so
`data-service.js`'s `normalizeTraktItem` can merge both sources without
caring which one an item came from. Keep that shape if you touch the entry
schema.

Music has no entry form on purpose - Last.fm scrobbling already covers it
automatically, so there was nothing to duplicate.

### Goodreads switched from the CSV export to a full reread-history scrape (2026-09)

`data/goodreads_library_export.csv` (Goodreads' own export) only ever
carries one `Date Read` per book, so a book reread 3 times looked like a
single read. `zenobase` (the data repo) now has
`scripts/scrape_goodreads_reads.py`, a manual/local-only Playwright tool
that scrapes the actual "read" shelf page (which server-renders the full
per-read date list) into `data/goodreads_reads_full.json` - one row per
book with a `read_events` array. `loadBooks()` in `js/data-service.js` was
updated to read that file and flatten it: **one dashboard entry per read
event**, not per book, so a 3-times-reread book now produces 3 rows. See
`zenobase`'s own `CLAUDE.md` for how/when that scrape gets refreshed - it's
not tied to the nightly cron, so this file's freshness lags behind
`trakt`/`lastfm`.

`js/csv.js` (the RFC4180 CSV parser, only ever used to parse this export)
is now dead code - its `<script>` tag was removed from `index.html`, but
the file itself is still present if you want to delete it.

## Metadata sources (both CORS-verified, not assumed)

- **TMDB** (`js/tmdb.js`) - movies/TV, needs a free API key the user
  supplies. Their key-request form asks for address/phone as part of the
  standard "Developer" (free) plan application - that's normal, not a
  commercial upsell.
- **Open Library** (`js/openlibrary.js`) - books, no key needed at all.

## Gotchas hit while building this (don't repeat them)

- **Shared script dependencies must be included on every page that uses
  them.** `settings.js` is loaded by both `index.html` and `add.html`
  because both show the Settings panel, and it calls `getTmdbKey()`/
  `setTmdbKey()` from `tmdb.js`. Forgetting to include `tmdb.js` in
  `index.html` caused an uncaught `ReferenceError` inside the same
  `DOMContentLoaded` handler that calls `loadAndRenderDashboard()` - which
  silently killed data loading with no visible error tied to the real
  cause ("dashboard is empty" turned out to be a missing `<script>` tag,
  not a data/auth problem). If you add a new shared dependency, check both
  HTML files' script lists.
- **A PAT scoped to the wrong repo returns a plain 404, not 403.** GitHub
  does this deliberately (so a token can't be used to probe for private
  repos it doesn't have access to). If the dashboard loads but everything
  shows 0, check the PAT's repository access is actually `zenobase` (the
  data repo), not `zenobase-app` (this repo) - that exact mix-up happened
  once already.
- **GitHub Pages caches for 10 minutes** (`Cache-Control: max-age=600`).
  After pushing a fix, a hard refresh (Ctrl+Shift+R) may be needed to see
  it live - don't assume a fix "isn't working" without ruling this out
  first.
- Settings saving a *working* token must trigger a dashboard reload
  (`document.dispatchEvent(new CustomEvent("zenobase:settings-saved"))`) -
  the initial page load fires before the user has had a chance to enter a
  token, so nothing re-fetches automatically otherwise.

## Local dev notes (this machine specifically)

- No `node` on PATH; a working install exists at
  `C:\dev\tools\node-v20.11.1-win-x64\node.exe` - useful for
  `node --check file.js` syntax validation and quick logic smoke tests
  against real data before pushing.
- This network sits behind a TLS-inspecting corporate proxy
  (ReversingLabs). Tools that don't read the Windows certificate store
  (git's http backend, npm/node, Playwright's own downloader) will fail
  with cert errors unless pointed at an exported CA bundle. Same root
  cause as some of the Firefox/Trakt debugging done in the `zenobase`
  session - not specific to this repo, just this machine.

## Config

`js/config.js` hardcodes the data repo as `ncaklovic/zenobase` on branch
`main`. Update there if either ever changes.

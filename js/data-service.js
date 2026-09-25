// Loads and normalizes all four data sources into consistent shapes the
// dashboard can render without caring where each item came from.

async function loadJsonFile(path) {
  const text = await ghGetRawText(path);
  if (text === null) return [];
  return JSON.parse(text);
}

// "HH:MM:SS" -> total seconds. listened_duration/episode_duration in the
// podcast export are always this shape (no days component seen in practice).
function parseHmsToSeconds(hms) {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function normalizeTraktItem(raw, source) {
  const base = {
    id: String(raw.id),
    watchedAt: new Date(raw.watched_at),
    type: raw.type,
    source,
  };
  if (raw.type === "episode") {
    return {
      ...base,
      title: raw.episode?.title || "",
      season: raw.episode?.season ?? null,
      number: raw.episode?.number ?? null,
      showTitle: raw.show?.title || "",
      year: raw.show?.year ?? null,
      ids: raw.episode?.ids || {},
    };
  }
  return {
    ...base,
    title: raw.movie?.title || "",
    year: raw.movie?.year ?? null,
    ids: raw.movie?.ids || {},
  };
}

async function loadWatched() {
  const [trakt, manual] = await Promise.all([
    loadJsonFile(CONFIG.paths.trakt),
    loadJsonFile(CONFIG.paths.manualWatched),
  ]);
  const items = [
    ...trakt.map((r) => normalizeTraktItem(r, "trakt")),
    ...manual.map((r) => normalizeTraktItem(r, "manual")),
  ];
  items.sort((a, b) => b.watchedAt - a.watchedAt);
  return items;
}

async function loadMusic() {
  // Source file is already sorted newest-first; not re-sorting here since
  // this list can be large and the source order is trustworthy.
  const scrobbles = await loadJsonFile(CONFIG.paths.lastfm);
  return scrobbles.map((s) => ({
    name: s.name,
    artist: s.artist,
    album: s.album || null,
    uts: Number(s.uts),
    watchedAt: new Date(Number(s.uts) * 1000),
  }));
}

async function loadBooks() {
  const [goodreadsRaw, manual] = await Promise.all([
    loadJsonFile(CONFIG.paths.goodreads),
    loadJsonFile(CONFIG.paths.manualBooks),
  ]);

  // One row per book with a read_events list - a reread book contributes
  // one dashboard entry per past read, not just its latest date.
  const goodreadsBooks = goodreadsRaw.flatMap((b) =>
    b.read_events.map((e) => ({
      title: b.title,
      author: b.author,
      rating: null, // never populated in the source data
      dateRead: e.date_iso ? new Date(e.date_iso) : null,
      source: "goodreads",
    }))
  );

  const manualBooks = manual.map((b) => ({
    id: b.id || null, // older entries predate ids - see bookMatchPredicate in dashboard.js
    title: b.title,
    author: b.author,
    rating: b.rating ?? null,
    dateRead: b.date_read ? new Date(b.date_read) : null,
    source: "manual",
    ids: b.ids || {},
  }));

  const all = [...goodreadsBooks, ...manualBooks];
  all.sort((a, b) => (b.dateRead || 0) - (a.dateRead || 0));
  return all;
}

async function loadPodcasts() {
  const text = await ghGetRawText(CONFIG.paths.podcasts);
  if (text === null) return [];
  const rows = parseCsv(text);
  const items = rows.map((r) => ({
    podcastName: r.podcast_name,
    episodeName: r.episode_name,
    // Source timestamps are "YYYY-MM-DD HH:MM:SS" (no "T") - Date can't
    // reliably parse that form across browsers without it.
    listenedAt: new Date(r.listening_start_at.replace(" ", "T")),
    durationSeconds: parseHmsToSeconds(r.listened_duration),
    fullyListened: r.fully_listened === "true",
  }));
  items.sort((a, b) => b.listenedAt - a.listenedAt);
  return items;
}

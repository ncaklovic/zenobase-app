// Loads and normalizes all four data sources into consistent shapes the
// dashboard can render without caring where each item came from.

async function loadJsonFile(path) {
  const text = await ghGetRawText(path);
  if (text === null) return [];
  return JSON.parse(text);
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

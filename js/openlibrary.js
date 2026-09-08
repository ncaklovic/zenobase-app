// Open Library client for book lookup - no API key required at all.

async function openLibrarySearch(query) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=15`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library search failed: ${res.status}`);
  const data = await res.json();
  return (data.docs || []).map((b) => ({
    title: b.title,
    author: (b.author_name && b.author_name[0]) || "Unknown",
    year: b.first_publish_year || null,
    olKey: b.key, // e.g. "/works/OL12345W"
    isbn: (b.isbn && b.isbn[0]) || null,
    cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-S.jpg` : null,
  }));
}

// Renders the four-tab dashboard (Movies, TV, Books, Music) from the
// normalized data loaded by data-service.js.

function fmtDate(d) {
  if (!d || isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PAGE_SIZE = 50;

// Renders `items` as a <ul class="item-list"> with Prev/Next paging below
// it, `pageSize` items at a time. `renderItem` builds one <li> per item.
function renderPaginatedList(container, items, renderItem, pageSize = PAGE_SIZE) {
  let page = 0;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const list = el("ul", "item-list");
  const pager = el("div", "pager");
  container.appendChild(list);
  container.appendChild(pager);

  function render() {
    list.innerHTML = "";
    const start = page * pageSize;
    for (const item of items.slice(start, start + pageSize)) {
      list.appendChild(renderItem(item));
    }

    pager.innerHTML = "";
    if (totalPages <= 1) return;

    const prevBtn = el("button", "pager-btn", "‹ Prev");
    prevBtn.disabled = page === 0;
    prevBtn.addEventListener("click", () => {
      page--;
      render();
    });

    const nextBtn = el("button", "pager-btn", "Next ›");
    nextBtn.disabled = page >= totalPages - 1;
    nextBtn.addEventListener("click", () => {
      page++;
      render();
    });

    pager.appendChild(prevBtn);
    pager.appendChild(el("span", "pager-info", `Page ${page + 1} of ${totalPages}`));
    pager.appendChild(nextBtn);
  }

  render();
}

function renderMovies(container, watched) {
  const movies = watched.filter((w) => w.type === "movie");
  container.appendChild(el("p", "stat", `${movies.length} movies watched`));
  renderPaginatedList(container, movies, (m) => {
    const li = el("li", "item-row");
    li.appendChild(el("span", "item-date", fmtDate(m.watchedAt)));
    li.appendChild(el("span", "item-title", `${m.title}${m.year ? ` (${m.year})` : ""}`));
    if (m.source === "manual") li.appendChild(el("span", "badge", "manual"));
    return li;
  });
}

function renderTv(container, watched) {
  const episodes = watched.filter((w) => w.type === "episode");
  const shows = new Set(episodes.map((e) => e.showTitle));
  container.appendChild(
    el("p", "stat", `${episodes.length} episodes watched across ${shows.size} shows`)
  );
  renderPaginatedList(container, episodes, (e) => {
    const li = el("li", "item-row");
    li.appendChild(el("span", "item-date", fmtDate(e.watchedAt)));
    const code =
      e.season != null && e.number != null
        ? `S${String(e.season).padStart(2, "0")}E${String(e.number).padStart(2, "0")}`
        : "";
    li.appendChild(el("span", "item-title", `${e.showTitle} ${code} - ${e.title}`));
    if (e.source === "manual") li.appendChild(el("span", "badge", "manual"));
    return li;
  });
}

function renderBooks(container, books) {
  container.appendChild(el("p", "stat", `${books.length} books read`));
  renderPaginatedList(container, books, (b) => {
    const li = el("li", "item-row");
    li.appendChild(el("span", "item-date", fmtDate(b.dateRead)));
    li.appendChild(el("span", "item-title", `${b.title} - ${b.author}`));
    if (b.rating) li.appendChild(el("span", "rating", `★${b.rating}`));
    if (b.source === "manual") li.appendChild(el("span", "badge", "manual"));
    return li;
  });
}

function renderMusic(container, scrobbles) {
  container.appendChild(el("p", "stat", `${scrobbles.length} scrobbles`));
  renderPaginatedList(container, scrobbles, (s) => {
    const li = el("li", "item-row");
    li.appendChild(el("span", "item-date", fmtDate(s.watchedAt)));
    li.appendChild(el("span", "item-title", `${s.artist} - ${s.name}`));
    return li;
  });
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });
}

async function loadAndRenderDashboard() {
  const statusEl = document.getElementById("dashboard-status");

  if (!hasGitHubToken()) {
    statusEl.textContent = "Add your GitHub token in Settings to load data.";
    return;
  }

  statusEl.textContent = "Loading...";

  for (const id of ["tab-movies", "tab-tv", "tab-books", "tab-music"]) {
    document.getElementById(id).innerHTML = "";
  }

  try {
    const [watched, books, music] = await Promise.all([
      loadWatched(),
      loadBooks(),
      loadMusic(),
    ]);

    renderMovies(document.getElementById("tab-movies"), watched);
    renderTv(document.getElementById("tab-tv"), watched);
    renderBooks(document.getElementById("tab-books"), books);
    renderMusic(document.getElementById("tab-music"), music);

    statusEl.textContent = "";
  } catch (e) {
    statusEl.textContent = `Failed to load data: ${e.message}`;
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  initSettingsPanel();
  loadAndRenderDashboard();
});

// Settings saving a working token after the initial (token-less) load
// should actually load the data, not leave the page looking empty.
document.addEventListener("zenobase:settings-saved", loadAndRenderDashboard);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The API server, or a static week.json when the app is hosted without one
// (GitHub Pages, see server/src/export.js).
const WEEK_URL = import.meta.env.VITE_WEEK_URL ?? '/api/week';

// The server answers 202 while it scrapes the week's tilbudsaviser the first time.
export async function fetchWeek({ onWaiting } = {}) {
  for (let attempt = 0; attempt < 90; attempt++) {
    // Prices change daily: always ask the server (it can still answer "not modified").
    const res = await fetch(WEEK_URL, { cache: 'no-cache' });
    if (res.status === 200) return res.json();
    if (res.status !== 202) throw new Error(`Serveren svarede ${res.status}`);
    onWaiting?.();
    await sleep(3000);
  }
  throw new Error('Det tog for lang tid at hente tilbudsaviserne');
}

// Every item this week in a store, for "Tilføj vare" and Hjemme. One file per
// store (several hundred kilobytes each), so only your stores are fetched, the
// first time the search is used, and kept for the session.
const CATALOG_URL = import.meta.env.VITE_CATALOG_URL ?? '/api/catalog?store={store}';
const catalogs = new Map();
function storeCatalog(store) {
  if (!catalogs.has(store)) {
    catalogs.set(store, fetch(CATALOG_URL.replace('{store}', encodeURIComponent(store)), { cache: 'no-cache' }).then((res) => {
      if (res.status !== 200) throw new Error(`Varelisten kunne ikke hentes (${res.status})`);
      return res.json();
    }).catch((err) => {
      catalogs.delete(store); // try again next time
      throw err;
    }));
  }
  return catalogs.get(store);
}
export async function fetchCatalog(stores) {
  const parts = await Promise.all(stores.map(storeCatalog));
  return {
    categories: Object.assign({}, ...parts.map((p) => p.categories)),
    items: parts.flatMap((p) => p.items)
  };
}

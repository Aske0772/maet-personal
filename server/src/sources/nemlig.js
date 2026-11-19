// Shelf prices: Nemlig.com, an online supermarket with its whole assortment on
// public category pages (robots.txt allows them; only search, sort and filter
// URLs are disallowed). Each page carries its products as JSON in the page state
// (<script id="ng-state">). We read the innermost categories from the public
// sitemap, one page a second, and keep only facts: name, pack size, price,
// before-price and aisle. No images. Same prototype caveat as the other sources.
//
// The whole run takes ~10 minutes, so the result is cached on disk for a day:
// a second build the same day (every push builds the site) reuses it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { politeFetch } from './http.js';
import { parseSize } from './size.js';

export const NEMLIG_STORE_ID = 'nemlig';
const BASE = 'https://www.nemlig.com';
const SITEMAP = `${BASE}/sitemap/categories.xml`;
const GAP_MS = 1000;
const CACHE_HOURS = Number(process.env.NEMLIG_CACHE_HOURS ?? 24);

// Top-level aisles that are not food: kept for "Tilføj vare", never matched to recipes.
const NON_FOOD = [
  [/husholdning|rengoering|vask|papir|koekken-og-bolig|bolig|hjem/, 'husholdning'],
  [/personlig-pleje|pleje|helse|apotek|kosmetik|hygiejne/, 'pleje'],
  [/baby|boern|bleer/, 'baby'],
  [/dyr|kaeledyr|hund|kat/, 'andet'],
  [/blomster|planter|elektronik|legetoej|fritid|kontor|tobak/, 'andet']
];
const FOOD_AISLE = [
  [/drikkevarer|vin|oel|spiritus|kaffe-og-te/, 'drikke'],
  [/slik|snacks|chokolade/, 'snacks'],
  [/frost/, 'frost']
];

export function aisleOf(categoryPath) {
  const top = (categoryPath ?? '').toLowerCase();
  for (const [re, cat] of NON_FOOD) if (re.test(top)) return { cat, food: false };
  for (const [re, cat] of FOOD_AISLE) if (re.test(top)) return { cat, food: true };
  return { cat: null, food: true };
}

// Only the innermost categories: their parents list the same products again.
export function leafCategories(urls) {
  const paths = urls.map((u) => new URL(u).pathname.replace(/\/$/, ''));
  return paths.filter((p) => !paths.some((q) => q !== p && q.startsWith(p + '/')));
}

// The category object inside the page state ({ requestedCategory: { items: [...] } }).
export function productsFromPage(html, categoryPath) {
  const m = html.match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return [];
  const state = JSON.parse(m[1]);
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.requestedCategory?.items) {
      for (const it of node.requestedCategory.items) {
        const p = it?.type === 'product' ? normalizeProduct(it.product, categoryPath) : null;
        if (p) out.push(p);
      }
      return;
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(state);
  return out;
}

// { title: 'Abrikoser', description: '100 g / Nordthy', price: 1200, priceOriginal: null, … }
export function normalizeProduct(p, categoryPath) {
  if (!p?.id || !(p.price > 0)) return null;
  if (p.availability?.type && p.availability.type !== 'Available') return null;
  const [size, brand] = (p.description ?? '').split('/').map((s) => s.trim());
  const { cat, food } = aisleOf(categoryPath ?? p.tracking?.item_category);
  return {
    id: `nemlig-${p.id}`,
    storeId: NEMLIG_STORE_ID,
    heading: p.title,
    description: [size, brand].filter(Boolean).join(' / '),
    price: p.price / 100,
    prePrice: p.priceOriginal > p.price ? p.priceOriginal / 100 : null,
    quantity: parseSize(size),
    image: null,
    runFrom: null,
    runTill: null,
    cat,
    food
  };
}

function cached(file) {
  if (!existsSync(file)) return null;
  try {
    const { fetchedAt, products } = JSON.parse(readFileSync(file, 'utf8'));
    if (Date.now() - Date.parse(fetchedAt) < CACHE_HOURS * 3600_000 && products?.length) return products;
  } catch { /* broken cache: fetch again */ }
  return null;
}

export async function fetchNemligShelf({ cacheDir, log = () => {} } = {}) {
  const cacheFile = cacheDir ? join(cacheDir, 'nemlig.json') : null;
  const hit = cacheFile && cached(cacheFile);
  if (hit) {
    log(`  Nemlig.com: ${hit.length} varer fra cache`);
    return hit;
  }
  const xml = await (await politeFetch(SITEMAP, { accept: 'application/xml', label: 'Nemlig sitemap', gap: GAP_MS })).text();
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const leaves = leafCategories(urls);
  const products = new Map();
  let failed = 0;
  for (const path of leaves) {
    try {
      const res = await politeFetch(BASE + path, { accept: 'text/html', label: `Nemlig ${path}`, gap: GAP_MS });
      const top = path.split('/')[2];
      for (const p of productsFromPage(await res.text(), top)) products.set(p.id, p);
    } catch (err) {
      failed++;
      if (failed > 20) throw new Error(`for mange fejl (${err.message})`);
    }
  }
  const list = [...products.values()];
  if (list.length === 0) throw new Error('ingen varer fundet');
  if (cacheFile) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ fetchedAt: new Date().toISOString(), products: list }));
  }
  log(`  Nemlig.com: ${leaves.length} kategorier, ${list.length} varer${failed ? `, ${failed} sider fejlede` : ''}`);
  return list;
}

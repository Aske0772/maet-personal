// Source check, round 2: sitemaps, product pages and which API hosts the shop
// public pages carry. Prints only short facts.
const UA = 'Maet/0.1 (+https://github.com/Aske0772/maet-personal; kildetjek)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uniq = (a) => [...new Set(a)];
const grep = (text, re, n = 15) => uniq([...text.matchAll(re)].map((m) => m[0].slice(0, 180))).slice(0, n);

async function get(url, accept = 'text/html,application/json,application/xml') {
  await sleep(600);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow' });
    return { status: res.status, url: res.url, type: res.headers.get('content-type'), text: await res.text() };
  } catch (e) {
    return { status: 'ERR ' + e.message, text: '' };
  }
}
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
const head = (label, r) => console.log(`\n### ${label} → ${r.status} ${r.url ?? ''} (${r.text.length} b, ${r.type})`);

function ldTypes(html) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  return { blocks, types: uniq(blocks.flatMap((b) => grep(b, /"@type"\s*:\s*"[A-Za-z]+"/g, 30))) };
}

// --- Recipe sites -------------------------------------------------------------
async function sitemapTree(url, depth = 0, out = [], max = 6) {
  const r = await get(url);
  const l = locs(r.text);
  console.log(`${'  '.repeat(depth)}- ${url} → ${r.status}, ${l.length} locs`);
  if (/<sitemapindex/i.test(r.text) && depth < 1) {
    for (const child of l.slice(0, 40)) console.log(`${'  '.repeat(depth + 1)}· ${child}`);
    return { index: l };
  }
  return { urls: l };
}

async function recipeCheck(label, url) {
  const r = await get(url);
  head(`recipe ${label}`, r);
  const { blocks, types } = ldTypes(r.text);
  console.log('  ld+json:', blocks.length, types.join(' '));
  const recipe = blocks.find((b) => /"Recipe"/.test(b));
  if (recipe) {
    const ing = recipe.match(/"recipeIngredient"\s*:\s*\[([^\]]{0,240})/);
    console.log('  Recipe ✓ ingredients:', ing?.[1]);
    const img = recipe.match(/"image"\s*:\s*(\[[^\]]{0,300}|\{[^}]{0,300}|"[^"]+")/);
    console.log('  image:', img?.[1]?.slice(0, 300));
  } else {
    console.log('  other data:', grep(r.text, /(__NEXT_DATA__|__NUXT__|recipeIngredient|"ingredients"\s*:|"ingredientGroups"|"instructions"\s*:)/g).join(' | '));
  }
}

console.log('==== SITEMAPS ====');
for (const s of [
  'https://www.valdemarsro.dk/sitemap_index.xml',
  'https://www.arla.dk/sitemap.index.xml',
  'https://madensverden.dk/sitemap_index.xml',
  'https://mummum.dk/sitemap_index.xml',
  'https://spisbedre.dk/sitemap.xml',
  'https://www.dk-kogebogen.dk/sitemap/sitemap.xml'
]) await sitemapTree(s);

// A few recipe-looking URLs from each site's first recipe sitemap.
async function sample(sitemap, filter) {
  const r = await get(sitemap);
  const l = locs(r.text).filter(filter);
  console.log(`\n${sitemap}: ${l.length} matching, e.g.`, l.slice(0, 3).join(' '));
  return l;
}
const v = await sample('https://www.valdemarsro.dk/post-sitemap.xml', (u) => !/\/(tag|category)\//.test(u));
if (v[5]) await recipeCheck('valdemarsro', v[5]);
const a = await sample('https://www.arla.dk/sitemap.recipes.xml', (u) => /\/opskrifter\//.test(u));
if (a[5]) await recipeCheck('arla', a[5]);
const sb = await sample('https://spisbedre.dk/sitemap.xml', (u) => /\/opskrifter\//.test(u));
if (sb[5]) await recipeCheck('spisbedre', sb[5]);
const dk = await sample('https://www.dk-kogebogen.dk/sitemap/sitemap.xml', (u) => /opskrifter/.test(u));
if (dk[5]) await recipeCheck('dk-kogebogen', dk[5]);

// --- Shops ---------------------------------------------------------------------
console.log('\n==== SHOPS ====');
// Salling / BilkaToGo: product sitemap, one product page's structured data.
const btgProducts = await sample('https://www.bilkatogo.dk/sitemap-products.xml', () => true);
if (btgProducts[10]) {
  const r = await get(btgProducts[10]);
  head('bilkatogo product', r);
  const { blocks, types } = ldTypes(r.text);
  console.log('  ld+json types:', types.join(' '));
  const prod = blocks.find((b) => /"Product"/.test(b));
  if (prod) console.log('  product:', prod.replace(/\s+/g, ' ').slice(0, 500));
}
// Netto product pages?
const nettoMap = await get('https://netto.dk/sitemap.xml');
head('netto sitemap', nettoMap);
console.log('  ', locs(nettoMap.text).slice(0, 15).join('\n   '));
const nettoProductMap = locs(nettoMap.text).find((u) => /produkt|product/i.test(u));
if (nettoProductMap) {
  const l = locs((await get(nettoProductMap)).text);
  console.log('  netto product sitemap:', nettoProductMap, l.length, 'e.g.', l.slice(0, 2).join(' '));
  if (l[10]) {
    const r = await get(l[10]);
    head('netto product', r);
    const prod = ldTypes(r.text).blocks.find((b) => /"Product"/.test(b));
    console.log('  product:', prod?.replace(/\s+/g, ' ').slice(0, 500));
  }
}

// Dagrofa: a MENY store subdomain and the sitemaps.
for (const u of ['https://meny.dk/meny/sitemap.xml', 'https://parkvej.meny.dk/robots.txt', 'https://parkvej.meny.dk/sitemap.xml']) {
  const r = await get(u);
  head('dagrofa ' + u, r);
  if (u.endsWith('robots.txt')) console.log(r.text.slice(0, 600));
  else console.log('  ', locs(r.text).length, 'locs:', locs(r.text).slice(0, 8).join(' '));
}
const menyProducts = (await get('https://parkvej.meny.dk/sitemap.xml')).text;
const mp = locs(menyProducts).find((u) => /produkter\//.test(u));
if (mp) {
  const r = await get(mp);
  head('meny product', r);
  const prod = ldTypes(r.text).blocks.find((b) => /"Product"/.test(b));
  console.log('  product:', prod?.replace(/\s+/g, ' ').slice(0, 500));
}

// Coop: anything product-like in the sitemaps?
for (const u of ['https://coop.dk/sitemap.xml', 'https://365discount.coop.dk/sitemap.xml']) {
  const r = await get(u);
  const l = locs(r.text);
  head('coop ' + u, r);
  console.log('  ', l.length, 'locs; product-like:', l.filter((x) => /produkt|vare|product/i.test(x)).slice(0, 5).join(' '));
}

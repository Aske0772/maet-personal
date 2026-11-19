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


// Round 3: recipe pages only. A few URLs per site from its recipe sitemap.
async function sample(sitemap, filter, n = 3) {
  const r = await get(sitemap);
  const l = locs(r.text).filter(filter);
  console.log(`\n${sitemap}: ${locs(r.text).length} locs, ${l.length} matching`);
  return l;
}
const pick = (l, idx) => idx.map((i) => l[i]).filter(Boolean);
const dish = /kylling|okse|svin|laks|torsk|pasta|lasagne|frikadel|gryde|suppe|karry|curry|tacos|bolognese|risotto|wok|ovn|fisk|kartof|burger|pizza|chili|dahl|linse/;

const vr = await sample('https://www.valdemarsro.dk/post-sitemap2.xml', (u) => dish.test(u));
for (const u of pick(vr, [0, 7, 21])) await recipeCheck('valdemarsro', u);
const ar = await sample('https://www.arla.dk/sitemap.xml?type=Modules.Recipes.Business.SitemapUrlWriter.RecipeSitemapUrlWriter', (u) => dish.test(u));
for (const u of pick(ar, [0, 30])) await recipeCheck('arla', u);
const sb = await sample('https://spisbedre.dk/opskrifter/sitemap.xml', (u) => dish.test(u));
for (const u of pick(sb, [0, 30])) await recipeCheck('spisbedre', u);
const dk = await sample('https://www.dk-kogebogen.dk/sitemap/sitemap_retter-2.xml', () => true);
for (const u of pick(dk, [0, 50])) await recipeCheck('dk-kogebogen', u);
let mv = [];
for (let i = 1; i <= 5; i++) mv.push(...await sample(`https://madensverden.dk/post-sitemap${i === 1 ? '' : i}.xml`, (u) => dish.test(u)));
console.log('madensverden dish-like total:', mv.length);
let mm = [];
for (let i = 1; i <= 4; i++) mm.push(...await sample(`https://mummum.dk/post-sitemap${i === 1 ? '' : i}.xml`, (u) => dish.test(u)));
console.log('mummum dish-like total:', mm.length);

// Can a recipe image be shown from another site (no Referer)?
for (const u of pick(mv, [3]).concat(pick(mm, [3]))) {
  const r = await get(u);
  const img = r.text.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (!img) continue;
  await sleep(600);
  const res = await fetch(img, { headers: { 'User-Agent': UA }, referrerPolicy: 'no-referrer' });
  console.log(`\nimage ${img} → ${res.status} ${res.headers.get('content-type')} ${res.headers.get('content-length')} b, cache: ${res.headers.get('cache-control')}`);
  const srcset = r.text.match(/srcset="([^"]+)"/)?.[1];
  console.log('  srcset sample:', srcset?.slice(0, 300));
}

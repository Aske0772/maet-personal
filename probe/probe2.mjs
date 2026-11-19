// Source check, round 4: Nemlig.com and Dagrofa product pages (robots, sitemap,
// structured data on one product page). Public pages only.
const UA = 'Maet/0.1 (+https://github.com/Aske0772/maet-personal; kildetjek)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
async function get(url) {
  await sleep(800);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml' }, redirect: 'follow' });
    return { status: res.status, url: res.url, text: await res.text() };
  } catch (e) { return { status: 'ERR ' + e.message, text: '' }; }
}
function product(html) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const p = blocks.find((b) => /"Product"/.test(b));
  const meta = [...html.matchAll(/<meta[^>]+(product:price|og:price|itemprop="price")[^>]*>/gi)].map((m) => m[0]).slice(0, 3);
  return { ld: p?.replace(/\s+/g, ' ').slice(0, 400), meta, priceText: (html.match(/\d+[,.]\d{2}\s*(kr|,-)/i) ?? [])[0] };
}
for (const u of ['https://www.nemlig.com/robots.txt']) {
  const r = await get(u); console.log(`\n### ${u} → ${r.status}\n${r.text.slice(0, 1500)}`);
}
const maps = ['https://www.nemlig.com/sitemap.xml'];
for (const m of maps) {
  const r = await get(m); const l = locs(r.text);
  console.log(`\n### ${m} → ${r.status}, ${l.length} locs:`, l.slice(0, 12).join(' '));
  const child = l.find((x) => /product|vare/i.test(x));
  if (child) {
    const c = await get(child); const cl = locs(c.text);
    console.log(`  child ${child}: ${cl.length} locs, e.g.`, cl.slice(0, 3).join(' '));
    if (cl[20]) { const p = await get(cl[20]); console.log(`  product ${cl[20]} → ${p.status} ${p.text.length} b`, JSON.stringify(product(p.text))); }
  }
}
// Dagrofa: main-site sitemap entries that look like products, and one store product page.
for (const s of ['https://meny.dk/meny/sitemap.xml', 'https://spar.dk/spar/sitemap.xml']) {
  const r = await get(s); const l = locs(r.text);
  console.log(`\n### ${s}: ${l.length} locs; product-like:`, l.filter((x) => /produkt|vare|sortiment/i.test(x)).slice(0, 6).join(' '));
}
for (const u of ['https://parkvej.meny.dk/', 'https://parkvej.meny.dk/produkter']) {
  const r = await get(u);
  const links = [...new Set([...r.text.matchAll(/href="(\/produkter\/[^"]+)"/g)].map((m) => m[1]))];
  console.log(`\n### ${u} → ${r.status} ${r.text.length} b; product links: ${links.length}`, links.slice(0, 3).join(' '));
  if (links[0]) { const p = await get(new URL(links[0], u).href); console.log('  product', links[0], p.status, JSON.stringify(product(p.text))); break; }
}

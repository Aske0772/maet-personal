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

// Round 5: does Nemlig's product data carry a price; do category pages list products
// with prices; what is on MENY's store category pages and /foedevarepriser.
const r1 = await get('https://www.nemlig.com/produkt/5012105');
const ld = [...r1.text.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join(' ');
console.log('\n### nemlig product ld offers:', (ld.match(/"offers"[\s\S]{0,400}/) ?? ['none'])[0].replace(/\s+/g, ' '));
console.log('  gtin/brand/size:', (ld.match(/"(gtin13|brand|size|weight|description)"\s*:\s*("[^"]{0,80}"|\{[^}]{0,120}\})/g) ?? []).slice(0, 5).join(' | '));
const cats = locs((await get('https://www.nemlig.com/sitemap/categories.xml')).text);
console.log(`\n### nemlig categories: ${cats.length}, e.g.`, cats.slice(0, 5).join(' '));
for (const c of [cats.find((u) => /mejeri|frugt|kolonial/i.test(u)) ?? cats[3]]) {
  const r = await get(c);
  const prices = r.text.match(/"(Price|price|UnitPrice)"\s*:\s*\d+(\.\d+)?/g) ?? [];
  const names = r.text.match(/"(Name|name)"\s*:\s*"[^"]{3,60}"/g) ?? [];
  console.log(`  category ${c} → ${r.status} ${r.text.length} b; price fields: ${prices.length} e.g. ${prices.slice(0, 3)}; names: ${names.slice(0, 4)}`);
}
for (const u of ['https://parkvej.meny.dk/produkter/mejeri', 'https://meny.dk/foedevarepriser']) {
  const r = await get(u);
  const kr = r.text.match(/\d{1,3}[,.]\d{2}(?=\s*(kr|<|"))/g) ?? [];
  const names = [...new Set((r.text.match(/"(name|title|productName)"\s*:\s*"[^"]{3,60}"/g) ?? []))];
  console.log(`\n### ${u} → ${r.status} ${r.text.length} b; price-like: ${kr.length} e.g. ${kr.slice(0, 5)}; names: ${names.slice(0, 6).join(' | ')}`);
  const text = r.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log('  text:', text.slice(text.length > 3000 ? 1500 : 0, (text.length > 3000 ? 1500 : 0) + 700));
}

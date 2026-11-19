// Round 6: shape of Nemlig's category data (to write a parser) and REMA's departments.
const UA = 'Maet/0.1 (+https://github.com/Aske0772/maet-personal; kildetjek)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, accept = 'text/html') {
  await sleep(1000);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
  return { status: res.status, text: await res.text() };
}
const r = await get('https://www.nemlig.com/kategori/frugt-og-groent/toerret-frugt-og-noedder');
const scripts = [...r.text.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1], body: m[2] }));
console.log('scripts:', scripts.length);
for (const s of scripts) if (/"price"/.test(s.body)) console.log('  script attrs', s.attrs.slice(0, 120), 'len', s.body.length, 'start', s.body.slice(0, 200));
const i = r.text.indexOf('"price"');
console.log('\n--- around first price ---\n', r.text.slice(Math.max(0, i - 1500), i + 700));
const j = r.text.indexOf('"price"', i + 3000);
console.log('\n--- another ---\n', r.text.slice(Math.max(0, j - 900), j + 400));
console.log('\ncounts:', (r.text.match(/"ProductCount"|"totalCount"|"TotalProducts"|"NumFound"|"numFound"|"pageSize"|"PageSize"/g) ?? []).join(' '));
for (const k of ['ProductCount', 'totalCount', 'TotalProducts', 'NumFound', 'numFound', 'pageSize', 'PageSize', 'skip', 'take']) {
  const m = r.text.match(new RegExp(`"${k}"\\s*:\\s*\\d+`)); if (m) console.log('  ', m[0]);
}
const d = await get('https://api.digital.rema1000.dk/api/v3/departments', 'application/json');
console.log('\nREMA departments:', d.status, d.text.slice(0, 1500));

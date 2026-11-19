// Round 7: walk Nemlig's ng-state JSON to find the product list, and list REMA departments.
const UA = 'Maet/0.1 (+https://github.com/Aske0772/maet-personal; kildetjek)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, accept = 'text/html') {
  await sleep(1000);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept } });
  return { status: res.status, text: await res.text() };
}
function state(html) {
  const m = html.match(/<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}
// Arrays of objects that have a numeric price-like key and a name-like key.
function findLists(node, path = '$', out = []) {
  if (Array.isArray(node)) {
    const objs = node.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    if (objs.length && objs.some((o) => Object.keys(o).some((k) => /price/i.test(k)))) out.push({ path, n: node.length, sample: objs[0] });
    node.forEach((x, i) => i < 3 && findLists(x, `${path}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) findLists(v, `${path}.${k}`, out);
  }
  return out;
}
for (const url of ['https://www.nemlig.com/kategori/frugt-og-groent/toerret-frugt-og-noedder', 'https://www.nemlig.com/kategori/mejeri-og-koel']) {
  const r = await get(url);
  const s = state(r.text);
  const lists = s ? findLists(s) : [];
  console.log(`\n### ${url} → ${r.status}; lists with price: ${lists.length}`);
  for (const l of lists.slice(0, 6)) console.log('  ', l.path.slice(0, 160), 'n=', l.n, '\n     sample:', JSON.stringify(l.sample).slice(0, 900));
  const totals = JSON.stringify(s ?? {}).match(/"(totalCount|total|count|pageSize|take|skip|NumFound|totalHits)":\d+/g) ?? [];
  console.log('   totals:', [...new Set(totals)].slice(0, 12).join(' '));
}
const d = JSON.parse((await get('https://api.digital.rema1000.dk/api/v3/departments', 'application/json')).text);
console.log('\nREMA departments:', d.data.map((x) => `${x.id} ${x.name}`).join(' | '));

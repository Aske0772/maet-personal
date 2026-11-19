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
function findKey(node, key, path = '$', out = []) {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key && v > 0) out.push({ path: `${path}.${k}`, parent: node });
      findKey(v, key, `${path}.${k}`, out);
    }
  }
  return out;
}
const r = await get('https://www.nemlig.com/kategori/frugt-og-groent/toerret-frugt-og-noedder');
const s = state(r.text);
for (const hit of findKey(s, 'totalCount')) {
  console.log('\n### totalCount at', hit.path);
  const parent = hit.parent;
  console.log('   keys:', Object.keys(parent).join(', '));
  for (const [k, v] of Object.entries(parent)) {
    if (Array.isArray(v)) console.log(`   ${k}: array(${v.length}) first:`, JSON.stringify(v[0]).slice(0, 1500));
  }
}
const d = JSON.parse((await get('https://api.digital.rema1000.dk/api/v3/departments', 'application/json')).text);
console.log('\nREMA departments:', d.data.map((x) => `${x.id} ${x.name}`).join(' | '));

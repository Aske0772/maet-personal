// Source check, run in GitHub Actions: robots.txt and a few pages per candidate.
// Prints only short facts (status, rule lines, which endpoints a page mentions).
const UA = 'Maet/0.1 (+https://github.com/Aske0772/maet-personal; kildetjek)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, accept = 'text/html,application/json') {
  await sleep(500);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow' });
    const text = await res.text();
    return { status: res.status, url: res.url, text };
  } catch (e) {
    return { status: 'ERR ' + e.message, text: '' };
  }
}

function robotsSummary(text) {
  const out = [];
  let group = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^user-agent:/i.test(line)) group.push(line);
    else if (/^(dis)?allow:|^crawl-delay:|^sitemap:/i.test(line)) out.push(`  [${group.join(' ')}] ${line}`);
    if (/^(dis)?allow:/i.test(line) === false && /^user-agent:/i.test(line) === false && line === '') group = [];
  }
  // Only the groups that apply to everyone, plus sitemaps.
  return out.filter((l) => /\*|sitemap:/i.test(l)).slice(0, 40).join('\n');
}

const uniq = (a) => [...new Set(a)];
function grep(text, re, n = 15) {
  return uniq([...text.matchAll(re)].map((m) => m[0].slice(0, 160))).slice(0, n);
}

const ROBOTS = [
  'https://www.valdemarsro.dk', 'https://www.arla.dk', 'https://madensverden.dk',
  'https://mummum.dk', 'https://spisbedre.dk', 'https://www.dk-kogebogen.dk',
  'https://www.bilkatogo.dk', 'https://www.bilka.dk', 'https://www.foetex.dk', 'https://www.netto.dk',
  'https://www.meny.dk', 'https://spar.dk', 'https://minkobmand.dk', 'https://www.letkoeb.dk',
  'https://coop.dk', 'https://365discount.coop.dk', 'https://kvickly.coop.dk', 'https://www.lidl.dk'
];

const PAGES = [
  // Recipe sites: does a recipe page carry schema.org Recipe JSON-LD?
  ['https://www.valdemarsro.dk/kylling-i-karry/', 'recipe'],
  ['https://www.arla.dk/opskrifter/kylling-i-karry/', 'recipe'],
  ['https://madensverden.dk/kylling-i-karry/', 'recipe'],
  ['https://mummum.dk/kylling-i-karry/', 'recipe'],
  ['https://spisbedre.dk/opskrifter/kylling-i-karry', 'recipe'],
  ['https://www.dk-kogebogen.dk/opskrifter/1/kylling-i-karry/', 'recipe'],
  // Shops: which API hosts / search keys does the front page reference?
  ['https://www.bilkatogo.dk/', 'shop'],
  ['https://www.bilka.dk/mad-og-drikke/', 'shop'],
  ['https://www.foetex.dk/', 'shop'],
  ['https://www.netto.dk/', 'shop'],
  ['https://www.meny.dk/', 'shop'],
  ['https://spar.dk/', 'shop'],
  ['https://minkobmand.dk/', 'shop'],
  ['https://coop.dk/', 'shop'],
  ['https://365discount.coop.dk/', 'shop']
];

for (const base of ROBOTS) {
  const r = await get(base + '/robots.txt', 'text/plain');
  console.log(`\n### robots ${base} → ${r.status}`);
  if (typeof r.status === 'number' && r.status < 400) console.log(robotsSummary(r.text));
}

for (const [url, kind] of PAGES) {
  const r = await get(url);
  console.log(`\n### ${kind} ${url} → ${r.status} (${r.url ?? ''}, ${r.text.length} bytes)`);
  if (kind === 'recipe') {
    const blocks = [...r.text.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const types = blocks.flatMap((b) => grep(b, /"@type"\s*:\s*"?[A-Za-z\[\]" ,]+/g, 10));
    console.log('  ld+json blocks:', blocks.length, 'types:', uniq(types).join(' | '));
    const recipe = blocks.find((b) => /"Recipe"/.test(b));
    if (recipe) {
      for (const k of ['recipeIngredient', 'recipeInstructions', 'totalTime', 'recipeYield', 'image']) {
        console.log(`  has ${k}:`, recipe.includes(`"${k}"`));
      }
      const ing = recipe.match(/"recipeIngredient"\s*:\s*\[([^\]]{0,300})/);
      if (ing) console.log('  first ingredients:', ing[1].slice(0, 200));
    }
  } else {
    console.log('  api hosts:', grep(r.text, /https?:\/\/[a-z0-9.-]*(api|algolia|search|graphql|commerce|catalog)[a-z0-9.-]*\.[a-z]+[^"'\s<>]{0,60}/gi).join('\n    '));
    console.log('  algolia:', grep(r.text, /(algolia[A-Za-z]*|appId|applicationId|searchKey|apiKey)["']?\s*[:=]\s*["'][A-Za-z0-9_-]{6,}["']/g).join(' | '));
    console.log('  scripts:', grep(r.text, /<script[^>]+src="[^"]+"/g, 8).join('\n    '));
  }
}

// Round 9: how Valdemarsro and Arla mark up a recipe (attribute names around
// recipeIngredient), so the importer can read the facts. Prints markup shape only.
const UA = 'Maet/0.1 (+https://github.com/Aske0772/maet-personal; kildetjek)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) { await sleep(1000); const r = await fetch(url, { headers: { 'User-Agent': UA } }); return r.text(); }
const strip = (s) => s.replace(/>[^<]{40,}</g, (m) => `>${m.slice(1, 30)}…<`);
for (const url of ['https://www.valdemarsro.dk/pasta-med-laks/', 'https://www.arla.dk/opskrifter/minestronesuppe/']) {
  const html = await get(url);
  console.log(`\n### ${url}`);
  const i = html.indexOf('recipeIngredient');
  console.log('--- ingredient markup ---\n', strip(html.slice(Math.max(0, i - 600), i + 900)));
  for (const k of ['recipeInstructions', 'totalTime', 'recipeYield', '"name"', 'og:image', 'srcset']) {
    const j = html.indexOf(k);
    console.log(`--- ${k} @${j} ---\n`, j < 0 ? '' : strip(html.slice(Math.max(0, j - 200), j + 300)));
  }
}

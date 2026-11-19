// Build server/data/recipes.json from the imported facts (data/recipes-raw.json)
// and our own words for each dish (data/recipe-text.json: blurb + steps).
//
//   node scripts/build-recipes.mjs            → recipes.json + import-report.md
//   node scripts/build-recipes.mjs --report   → only the report (what maps, what doesn't)
//
// A dish is taken only when every ingredient that is not a basisvare can be priced
// (parse-ingredient.js), and only when we have written its steps.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIngredient } from '../src/parse-ingredient.js';
import { INGREDIENTS } from '../src/ingredients.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data');
const raw = JSON.parse(readFileSync(join(DATA, 'recipes-raw.json'), 'utf8')).recipes;
const textFile = join(DATA, 'recipe-text.json');
const texts = existsSync(textFile) ? JSON.parse(readFileSync(textFile, 'utf8')) : {};
const reportOnly = process.argv.includes('--report');
// Photo colours and load check (scripts/recipe-colors.mjs); a photo that failed to load is left out.
const colorFile = join(DATA, 'recipe-colors.json');
const colors = existsSync(colorFile) ? JSON.parse(readFileSync(colorFile, 'utf8')) : {};

const unitPrice = (id) => INGREDIENTS[id].normal[1] / INGREDIENTS[id].normal[0];

export function mapRecipe(r) {
  const lines = [];
  const unmatched = [];
  for (const line of r.ingredients) {
    const p = parseIngredient(line);
    if (p.skip) continue;
    if (p.unmatched) {
      // An optional extra ("evt. frisk koriander") we can't price is simply left out.
      if (/^(evt|eventuelt|gerne|til servering)/i.test(line.trim()) || /til servering|til pynt/i.test(line)) continue;
      unmatched.push(p.unmatched);
      continue;
    }
    lines.push(p);
    if (p.also) lines.push({ id: p.also, qty: 1 });
  }
  // The same ingredient twice (onion in the sauce and the salad) is one line.
  const merged = new Map();
  for (const l of lines) merged.set(l.id, (merged.get(l.id) ?? 0) + l.qty);
  const ingredients = [...merged.entries()].map(([id, qty]) => [id, Math.round(qty * 100) / 100]);
  return { ingredients, unmatched };
}

// Hero: what makes the dish worth suggesting when it is on offer – its most
// expensive ingredient, and the second when that is a big part of the price too.
// Herbs, cheese on top, cream and sauces are never what a dish is about.
const NOT_HERO = new Set(['krydderurter', 'parmesan', 'flode', 'creme_fraiche', 'revet_ost', 'citron', 'lime',
  'hvidloeg', 'loeg', 'pesto', 'nodder', 'oliven', 'kapers', 'vin', 'mayonnaise', 'chilisauce', 'woksauce',
  'ingefaer', 'frisk_chili', 'jalapenos', 'tomatpure', 'remoulade', 'maelk', 'yoghurt', 'burgerboller', 'brod', 'tortillas', 'pita']);
const PROTEIN = (id) => ['kod', 'fisk'].includes(INGREDIENTS[id].cat) || ['tun', 'fiskepinde', 'halloumi'].includes(id);
export function heroesOf(ingredients) {
  const costs = ingredients
    .filter(([id]) => !INGREDIENTS[id].staple && !NOT_HERO.has(id))
    .map(([id, qty]) => [id, qty * unitPrice(id)])
    .sort((a, b) => b[1] - a[1]);
  // The meat or fish when there is one; otherwise the main vegetable, pulse or cheese.
  const proteins = costs.filter(([id]) => PROTEIN(id));
  const pool = proteins.length ? proteins : costs;
  const total = pool.reduce((s, [, c]) => s + c, 0);
  const hero = pool.slice(0, 1).map(([id]) => id);
  if (pool[1] && pool[1][1] / total >= 0.25) hero.push(pool[1][0]);
  return hero;
}

export function dietOf(ingredients) {
  const cats = ingredients.map(([id]) => INGREDIENTS[id].cat);
  if (cats.includes('kod')) return 'kod';
  if (cats.includes('fisk') || ingredients.some(([id]) => ['tun', 'fiskepinde'].includes(id))) return 'fisk';
  return 'vegetar';
}

// Arla's image service resizes on request: the card is at most ~400 px wide on a phone
// (×1.5 for sharp screens), so 600×840 at quality 70 keeps photos well under 150 kB.
const sizedImage = (url) => url?.includes('images.arla.com')
  ? url.replace(/width=\d+&height=\d+/, 'width=600&height=840').replace(/&quality=\d+/, '') + '&quality=70'
  : url;

const hueOf = (hex) => {
  if (!hex) return 30;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 30;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(((h * 60) + 360) % 360);
};
const EMOJI = { kod: '🍖', fisk: '🐟', vegetar: '🥗' };

const out = [];
const report = { ok: [], missing: new Map(), noText: 0, noServes: 0 };
for (const r of raw) {
  const { ingredients, unmatched } = mapRecipe(r);
  if (!r.serves && !texts[r.id]?.serves) { report.noServes++; continue; }
  if (unmatched.length) {
    for (const u of unmatched) report.missing.set(u, (report.missing.get(u) ?? 0) + 1);
    continue;
  }
  if (ingredients.filter(([id]) => !INGREDIENTS[id].staple).length < 2) continue;
  report.ok.push(r.id);
  const text = texts[r.id];
  if (!text) { report.noText++; continue; }
  const diet = text.diet ?? dietOf(ingredients);
  out.push({
    id: r.id,
    title: text.title ?? r.title,
    blurb: text.blurb,
    minutes: text.minutes ?? r.minutes ?? 40,
    diet, serves: text.serves ?? r.serves, emoji: EMOJI[diet], hue: hueOf(colors[r.id]?.color ?? r.color),
    hero: text.hero ?? heroesOf(ingredients),
    ingredients,
    steps: text.steps,
    source: { name: r.siteName, url: r.url },
    image: colors[r.id] && colors[r.id].status !== 200 ? null : sizedImage(r.image),
    color: colors[r.id]?.color ?? r.color, tags: text.tags ?? []
  });
}

const missing = [...report.missing.entries()].sort((a, b) => b[1] - a[1]);
const md = [
  `# Opskriftsimport – rapport`,
  '',
  `- Importeret: ${raw.length} opskrifter`,
  `- Alle ingredienser kan prissættes: **${report.ok.length}**`,
  `- Heraf med egne trin (i appen): **${out.length}**`,
  `- Uden portioner (sprunget over): ${report.noServes}`,
  '',
  `## Ingredienser uden match (${missing.length})`,
  '',
  ...missing.slice(0, 150).map(([name, n]) => `- ${n} × ${name}`)
].join('\n');
writeFileSync(join(DATA, 'import-report.md'), md + '\n');
if (!reportOnly) writeFileSync(join(DATA, 'recipes.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${raw.length} importeret · ${report.ok.length} kan prissættes · ${out.length} med egne trin · ${missing.length} ukendte ingredienser`);

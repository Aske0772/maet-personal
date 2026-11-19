// Recipe import (run in GitHub Actions: .github/workflows/import-recipes.yml).
//
// Reads dinner recipes from Danish food sites that publish them as structured data
// (schema.org Recipe, as JSON-LD or microdata) and that robots.txt lets us read; see
// docs/kilder-pr-kaede.md. Only FACTS are kept: title, time, servings, ingredient
// lines, the image URL and the source URL. The method text is not stored: from it
// we keep only the numbers that decide the result (oven temperatures and times per
// step), and the steps are written anew in our own words (server/data/recipes.json).
//
//   node scripts/import-recipes.mjs [perSite=150] > data/recipes-raw.json

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { splitLine } from '../src/parse-ingredient.js';

const PER_SITE = Number(process.argv[2] ?? 150);
// --urls <file>: re-read exactly these recipes ([{ site, url }]) instead of sampling sitemaps.
const urlsArg = process.argv.indexOf('--urls');
const ONLY = urlsArg > 0 ? JSON.parse(readFileSync(process.argv[urlsArg + 1], 'utf8')) : null;
const UA = 'Maet/0.1 (+https://github.com/Aske0772/maet-personal; opskriftsimport, personlig brug)';
const GAP_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const last = new Map();

async function get(url, accept = 'text/html') {
  const host = new URL(url).host;
  const wait = (last.get(host) ?? 0) + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last.set(host, Date.now());
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));

// Dinner-looking URLs, and what is clearly not a dinner.
const DISH = /kylling|okse|svin|gris|kalv|lam|laks|torsk|fisk|rejer|tun|pasta|spaghetti|lasagne|frikadel|gryde|suppe|karry|curry|tacos|burrito|bolognese|risotto|wok|ovn|kartof|burger|pizza|chili|dahl|linse|kikært|boller-i|tærte|quiche|frittata|omelet|mørbrad|kotelet|medister|flæsk|bøf|boef|hakket|kød|koed|nudler|ris-|wrap|pita|fad|stroganoff|gullasch|biksemad|pølse|poelse|bacon|skinke|kalkun|and-|panden|sandwich|toast|stuvning|grøntsag|groentsag|vegetar|vegan|bønne|boenne|tofu|halloumi|feta|gratin|carbonara|pesto|ramen|teriyaki|tikka|tandoori|kebab/i;
const NOT = /kage|dessert|is-|cookie|muffin|brød|broed|bolle(?!r-i)|smoothie|drink|cocktail|dressing|marinade|dip|sylte|syltet|marmelade|chutney|snack|tilbehoer|tilbehør|boganbefaling|anmeldelse|konkurrence|vin-|julegave|gaveide|rundstykke|scones|vafler|pandekage|grød|groed|morgenmad|brunch|krydderiblanding|bagning|smørrebrød|smoerrebroed|kiks|knækbrød|is$|sorbet|trifle|tiramisu|cheesecake|granola/i;

const SITES = [
  { id: 'arla', name: 'Arla', sitemaps: ['https://www.arla.dk/sitemap.xml?type=Modules.Recipes.Business.SitemapUrlWriter.RecipeSitemapUrlWriter'] },
  { id: 'valdemarsro', name: 'Valdemarsro', sitemaps: [1, 2, 3].map((i) => `https://www.valdemarsro.dk/post-sitemap${i === 1 ? '' : i}.xml`) },
  { id: 'madensverden', name: 'Madens Verden', sitemaps: [1, 2, 3, 4, 5].map((i) => `https://madensverden.dk/post-sitemap${i === 1 ? '' : i}.xml`) },
  { id: 'mummum', name: 'Mummum', sitemaps: [1, 2, 3, 4].map((i) => `https://mummum.dk/post-sitemap${i === 1 ? '' : i}.xml`) }
];

const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html) => decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// schema.org Recipe from JSON-LD (Arla writes the + of ld+json as &#x2B;).
function jsonLdRecipe(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld(?:\+|&#x2B;)json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (Array.isArray(n)) { stack.push(...n); continue; }
      const type = [].concat(n['@type'] ?? n.type ?? []);
      if (type.includes('Recipe')) return n;
      if (n['@graph']) stack.push(n['@graph']);
    }
  }
  return null;
}

// Steps as { text, section }: the section's own label ("Tilbehør til suppen") is kept,
// but generic placeholders ("First instruction") are not.
function instructionsOf(r) {
  const out = [];
  const walk = (x, section) => {
    if (!x) return;
    if (typeof x === 'string') return out.push({ text: text(x), section });
    if (Array.isArray(x)) return x.forEach((y) => walk(y, section));
    if (x.itemListElement) {
      const name = x.name && !/instruction|^step/i.test(x.name) ? text(x.name) : section;
      return walk(x.itemListElement, name);
    }
    if (x.text) return out.push({ text: text(x.text), section });
  };
  walk(r.recipeInstructions, null);
  return out.filter((x) => x.text);
}

// Valdemarsro: microdata (itemprop="recipeIngredient" etc.).
function microdataRecipe(html) {
  const ing = [...html.matchAll(/<li[^>]*itemprop="recipeIngredient"[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => text(m[1]));
  if (!ing.length) return null;
  const prop = (name) => html.match(new RegExp(`itemprop="${name}"[^>]*>([^<]*)<`, 'i'))?.[1];
  const instr = html.match(/itemprop="recipeInstructions"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
  return {
    name: text(html.match(/<h2[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? ''),
    totalTime: prop('totalTime'),
    recipeYield: prop('recipeYield'),
    recipeIngredient: ing,
    steps: [...instr.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => ({ text: text(m[1]), section: null })).filter((x) => x.text)
  };
}

const minutesOf = (iso) => {
  const m = String(iso ?? '').match(/P(?:T)?(?:(\d+)H)?(?:(\d+)M)?/i);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : null;
};
const servingsOf = (y) => {
  const m = String([].concat(y ?? [])[0] ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
};

// The facts that decide the result, per step – never the source's sentences. Each
// field is picked from a fixed vocabulary or is a number: what is done (verbs),
// which of the recipe's ingredients go in (by index), how long, how hot, on what
// heat, lid on or off, in what (pan, pot, oven), how you know it is done, and how
// it is portioned ("halvdelen", "lidt ad gangen").
const VERBS = ['bring i kog', 'kog op', 'steg', 'brun', 'svits', 'kog', 'simr', 'bag', 'grill', 'damp', 'blancher',
  'hak', 'skær', 'riv', 'pres', 'bland', 'rør', 'vend', 'pisk', 'marinér', 'mariner', 'smag', 'server', 'drys',
  'fordel', 'læg', 'hæld', 'mos', 'blend', 'purér', 'rist', 'lun', 'varm', 'afkøl', 'hvil', 'fyld', 'rul', 'form',
  'pensl', 'kom', 'tilsæt', 'jævn', 'skum', 'si ', 'dryp', 'gratiner', 'karamellisér', 'glasér', 'trække', 'sæt over',
  'tag op', 'tag af', 'skyl', 'dræn', 'afdryp', 'halver', 'udblød', 'ælt', 'hæv', 'smør', 'krydr', 'pynt'];
const HEAT = ['svag varme', 'lav varme', 'middel varme', 'jævn varme', 'god varme', 'høj varme', 'kraftig varme',
  'meget varm', 'svagt', 'kraftigt', 'blidt', 'kog op', 'koge op', 'i kog', 'simre', 'småkoge', 'trække'];
const LID = ['under låg', 'uden låg', 'låg på', 'tag låget af', 'læg låg', 'med låg', 'alufolie', 'folie'];
const VESSEL = ['gryde', 'pande', 'wok', 'fad', 'bradepande', 'ovn', 'blender', 'stavblender', 'foodprocessor', 'skål',
  'bageplade', 'grill', 'airfryer', 'dampovn', 'tærteform', 'springform', 'si', 'mortér'];
const DONE = ['møre', 'mør', 'gyldne', 'gylden', 'sprøde', 'sprød', 'gennemstegt', 'gennemkogt', 'bløde', 'blød',
  'blanke', 'tyk', 'tykke', 'cremet', 'glat', 'falder sammen', 'karamelliseret', 'kogt ind', 'koger ind', 'hvid',
  'lysebrun', 'brun', 'rosa', 'smeltet', 'stivnet', 'bobler', 'jævnet', 'al dente', 'kerne', 'gennemvarm'];
const SPLIT = ['halvdelen', 'resten', 'lidt ad gangen', 'i portioner', 'i et lag', 'hver for sig', 'til sidst',
  'først', 'imens', 'samtidig', 'efter', 'inden servering', 'lige før servering', 'et ad gangen'];
const OVEN = ['varmluft', 'alm. ovn', 'almindelig ovn', 'over-/undervarme', 'grillfunktion', 'midt i ovnen', 'nederst', 'øverst'];
const NUM = '(?:\\d+(?:[,.]\\d+)?\\s*[½¼¾]?|[½¼¾])';
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Verbs match as a word start ("steg" in "stegt"); the other lists as whole words.
const found = (list, s, whole = true) => list.filter((w) => new RegExp(`(?<![a-zæøå])${esc(w)}${whole ? '(?![a-zæøå])' : ''}`, 'i').test(s));

// Which of the recipe's own ingredient lines a step mentions: a word in the step
// (without its ending: "bouillonen" → "bouillon") found inside an ingredient name
// ("grøntsagsbouillon").
const STOP = /^(til|med|og|eller|evt|ca|kom|lad|det|den|der|som|skal|ved|fra|over|under|alle?|godt|lidt|mere|hver|når|så|har|kan|ikke|imens|gryde|pande|fad|ovn|skål|varme|minutter|grader|stykker|tern|skiver|både|halve|grove|grofthakket|finthakket|frisk|friske)$/;
const stem = (w) => w.replace(/(erne|ene|en|et|er|ne|e|s)$/, '');
function ingredientNames(lines) {
  return lines.map((l) => splitLine(l).name.toLowerCase());
}
function mentions(step, names) {
  const words = step.toLowerCase().split(/[^a-zæøåé]+/).filter((w) => w.length >= 3 && !STOP.test(w)).map(stem).filter((w) => w.length >= 3);
  return names.map((n, i) => (words.some((w) => n.includes(w)) ? i : -1)).filter((i) => i >= 0);
}

function stepFacts(steps, lines) {
  const names = ingredientNames(lines);
  return steps.map(({ text: s, section }) => ({
    section: section ?? null,
    verbs: found(VERBS, s, false).map((v) => v.trim()),
    ings: mentions(s, names),
    time: [...s.matchAll(new RegExp(`(?:ca\\.\\s*)?(${NUM}(?:\\s*(?:-|–|til)\\s*${NUM})?)\\s*(min\\.?|minutter|time|timer|sek\\.?|sekunder|døgn)(?![a-zæøå])`, 'gi'))]
      .map((m) => `${m[1].replace(/\s+/g, '')} ${m[2].replace('.', '')}`),
    temp: [...s.matchAll(/(\d{2,3})\s*(?:°|grader|gr\.)/gi)].map((m) => Number(m[1])),
    heat: found(HEAT, s),
    lid: found(LID, s),
    in: found(VESSEL, s),
    done: found(DONE, s),
    order: found(SPLIT, s),
    oven: found(OVEN, s)
  }));
}

// A portrait image the swipe card can show at once: small, and from the source.
function imageOf(site, html, r) {
  const og = decode(html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? '');
  const ld = [].concat(r?.image ?? []).map((x) => (typeof x === 'string' ? x : x?.url)).find(Boolean);
  const src = og || ld;
  if (!src) return null;
  if (site === 'arla') {
    const base = src.split('?')[0];
    return { url: `${base}?width=720&height=1000&mode=crop&format=webp`, thumb: `${base}?width=48&height=64&mode=crop&format=jpg` };
  }
  // WordPress: the smallest srcset version at least 800 px wide of the same picture.
  const stem = src.replace(/(-\d+x\d+)?\.(jpe?g|png|webp)$/i, '');
  const sizes = [...html.matchAll(/srcset="([^"]+)"/g)]
    .flatMap((m) => m[1].split(',').map((p) => p.trim().split(/\s+/)))
    .filter(([u, w]) => u?.startsWith(stem) && /^\d+w$/.test(w ?? ''))
    .map(([u, w]) => ({ u, w: parseInt(w, 10) }))
    .sort((a, b) => a.w - b.w);
  const pick = sizes.find((s) => s.w >= 800) ?? null;
  return { url: pick?.u ?? src, thumb: sizes.find((s) => s.w >= 150)?.u ?? pick?.u ?? src };
}

// The image's main colour, for the card's background before the photo shows.
async function colorOf(url) {
  try {
    const buf = Buffer.from(await (await get(url, 'image/*')).arrayBuffer());
    const { dominant } = await sharp(buf).stats();
    return `#${[dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
}

async function readRecipe(site, url) {
  const html = await (await get(url)).text();
  const ld = jsonLdRecipe(html);
  const md = ld ? null : microdataRecipe(html);
  const r = ld ?? md;
  if (!r?.recipeIngredient?.length) return null;
  const steps = ld ? instructionsOf(ld) : md.steps;
  const image = imageOf(site.id, html, ld);
  return {
    id: `${site.id}-${new URL(url).pathname.split('/').filter(Boolean).pop()}`,
    site: site.id, siteName: site.name, url,
    title: text(r.name ?? ''),
    category: [].concat(ld?.recipeCategory ?? []).join(', '),
    minutes: minutesOf(r.totalTime) || (minutesOf(r.prepTime) + minutesOf(r.cookTime)) || null,
    serves: servingsOf(r.recipeYield),
    ingredients: r.recipeIngredient.map((s) => text(String(s))),
    stepCount: steps.length,
    stepFacts: stepFacts(steps, r.recipeIngredient.map((x) => text(String(x)))),
    image: image?.url ?? null,
    color: image ? await colorOf(image.thumb) : null
  };
}

const out = [];
if (ONLY) {
  for (const { site, url } of ONLY) {
    try {
      const r = await readRecipe(SITES.find((x) => x.id === site), url);
      if (r) out.push(r);
      else console.error(`  ingen opskrift: ${url}`);
    } catch (e) {
      console.error(`  ${e.message}`);
    }
  }
  console.error(`${out.length} af ${ONLY.length} genlæst`);
}
for (const site of ONLY ? [] : SITES) {
  const urls = [];
  for (const sm of site.sitemaps) {
    try {
      urls.push(...locs(await (await get(sm, 'application/xml')).text()));
    } catch (e) {
      console.error(`  ${site.name}: ${e.message}`);
    }
  }
  const candidates = urls.filter((u) => DISH.test(u) && !NOT.test(u));
  // Spread over the whole archive, not only the newest posts.
  const step = Math.max(1, Math.floor(candidates.length / PER_SITE));
  const picked = candidates.filter((_, i) => i % step === 0).slice(0, PER_SITE);
  console.error(`${site.name}: ${urls.length} URL'er, ${candidates.length} aftensmad-agtige, læser ${picked.length}`);
  let n = 0;
  for (const url of picked) {
    try {
      const r = await readRecipe(site, url);
      if (r && !(site.id === 'arla' && r.category && !/aftensmad|hovedret/i.test(r.category))) {
        out.push(r);
        n++;
      }
    } catch (e) {
      console.error(`  ${e.message}`);
    }
  }
  console.error(`  ${n} opskrifter`);
}
process.stdout.write(JSON.stringify({ importedAt: new Date().toISOString(), recipes: out }, null, 1));

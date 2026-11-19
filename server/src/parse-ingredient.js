// Recipe ingredient lines ("2 fed hvidløg, presset", "1½ dl fløde", "1 dåse hakkede
// tomater (400 g)") → { id, qty } in the canonical ingredient's own unit (see
// ingredients.js), so imported recipes are priced like our own.
import { INGREDIENTS } from './ingredients.js';
import { ALIASES } from './ingredient-aliases.js';

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const NUM = String.raw`(?:\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛]|\d+\s*\/\s*\d+)`;

// Unit words → [kind, factor]. kind: 'g' (weight), 'ml' (volume), 'stk' (count),
// or a container whose size depends on the ingredient ('daase', 'pakke', 'bundt').
const UNITS = [
  [/^(kg|kilo)$/, ['g', 1000]], [/^(g|gr|gram)$/, ['g', 1]],
  [/^(l|ltr|liter)$/, ['ml', 1000]], [/^dl$/, ['ml', 100]], [/^cl$/, ['ml', 10]], [/^ml$/, ['ml', 1]],
  [/^(spsk|spiseskefuld|spiseskefulde)$/, ['ml', 15]], [/^(tsk|teskefuld|teskefulde)$/, ['ml', 5]],
  [/^(knsp|knivspids|nip|drys)$/, ['ml', 0.5]],
  [/^(stk|styk|stykker)$/, ['stk', 1]], [/^fed$/, ['fed', 1]],
  [/^(dåse|dåser|ds|dase)$/, ['daase', 1]], [/^(pakke|pakker|pk|pakning|bakke|bakker|pose|poser|glas|net)$/, ['pakke', 1]],
  [/^(bundt|bdt|bundter|potte|potter)$/, ['bundt', 1]], [/^(rulle|ruller|plade|plader)$/, ['pakke', 1]],
  [/^(stængel|stængler|stang|stænger)$/, ['kvist', 1]], [/^(håndfuld|håndfulde|hf)$/, ['haandfuld', 1]],
  [/^(skive|skiver)$/, ['skive', 1]], [/^(kvist|kviste|stilk|stilke|blad|blade)$/, ['kvist', 1]]
];

export function parseNumber(s) {
  if (!s) return null;
  s = s.replace(/\s+/g, '');
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : null;
  }
  const frac = s.match(/[½¼¾⅓⅔⅛]$/);
  const whole = frac ? s.slice(0, -1) : s;
  return (whole ? Number(whole.replace(',', '.')) : 0) + (frac ? FRACTIONS[frac[0]] : 0);
}

// "2-3 gulerødder" → 2.5; "1½ dl" → 1.5.
function leadingAmount(line) {
  const m = line.match(new RegExp(`^(${NUM})(?:\\s*(?:-|–|til)\\s*(${NUM}))?\\s*`));
  if (!m) return { amount: null, rest: line };
  const a = parseNumber(m[1]);
  const b = m[2] ? parseNumber(m[2]) : null;
  return { amount: b ? (a + b) / 2 : a, rest: line.slice(m[0].length) };
}

// Split a line into amount, unit and the name of the thing, plus any weight
// printed in brackets ("1 dåse tomater (400 g)").
export function splitLine(raw) {
  let line = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const optional = /^(evt\.?|eventuelt|gerne)\s/.test(line) || /\(evt\.?\)/.test(line);
  line = line.replace(/^(evt\.?|eventuelt|gerne|ca\.?|cirka)\s+/, '');
  const bracket = line.match(/\(([^)]*)\)/)?.[1] ?? '';
  const weightHint = bracket.match(new RegExp(`(${NUM})\\s*(g|gram|kg|ml|dl|l)\\b`));
  line = line.replace(/\([^)]*\)/g, ' ');
  const { amount, rest } = leadingAmount(line);
  let name = rest.trim();
  let unit = null;
  const word = name.match(/^([a-zæøå]+)\.?\s+/);
  if (word) {
    const hit = UNITS.find(([re]) => re.test(word[1]));
    if (hit) {
      unit = hit[1];
      name = name.slice(word[0].length);
    }
  }
  // "12 rensede salatblade": leaves, not heads.
  if (!unit && /blade?(?![a-zæøå])/.test(name.split(/,| - /)[0])) unit = ['kvist', 1];
  // "200 g. kyllingebryst, i strimler" → name stops at the first comma; "af"/"à" fillers go.
  name = name.split(/,| - | – /)[0].replace(/^(af|à|a)\s+/, '').replace(/\s+/g, ' ').trim();
  const hint = weightHint ? { amount: parseNumber(weightHint[1]), unit: weightHint[2] } : null;
  return { amount, unit, name, optional, hint, raw };
}

export function matchName(name) {
  for (const [id, re] of ALIASES) if (re.test(name)) return id;
  return null;
}

const toGrams = { g: 1, gram: 1, kg: 1000, ml: 1, dl: 100, l: 1000 };

// Amount in the canonical ingredient's unit, or null when the units can't be bridged.
export function toIngredientUnit(parsed, id) {
  const ing = INGREDIENTS[id];
  let { amount, unit } = parsed;
  if (amount == null) amount = ing.staple ? 0 : 1;
  const [kind, factor] = unit ?? ['stk', 1];
  const conv = ing.convert ?? {};
  // A container ("1 dåse") is its printed weight when there is one, else the ingredient's own size.
  if (['daase', 'pakke'].includes(kind) && parsed.hint) {
    const g = parsed.hint.amount * (toGrams[parsed.hint.unit] ?? 1);
    return fromBase(ing, amount * g, 'g');
  }
  if (kind === 'daase') return fromBase(ing, amount * (conv.daase ?? 400), ing.unit === 'stk' ? 'g' : ing.unit === 'ml' ? 'ml' : 'g');
  if (kind === 'pakke') return amount * (conv.pakke ?? ing.normal[0]);
  if (kind === 'skive' && conv.skive != null) return amount * conv.skive;
  if (kind === 'bundt' || kind === 'haandfuld' || kind === 'kvist' || kind === 'skive') {
    if (conv[kind] != null) return amount * conv[kind];
    // A slice or a leaf of something we count whole (an agurk, a head of salad) is a small part of it.
    if (ing.unit === 'stk') return kind === 'kvist' ? amount * 0.1 : kind === 'skive' ? amount / 15 : amount;
    if (kind === 'kvist' && ing.gPerStk) return amount * Math.min(15, ing.gPerStk / 15);
    return amount * ({ bundt: 30, haandfuld: 30, kvist: 2, skive: 25 }[kind]);
  }
  if (kind === 'fed') return ing.unit === 'stk' ? amount : amount * 5;
  if (kind === 'skive' && conv.skive != null) return amount * conv.skive;
  if (kind === 'stk') {
    if (ing.unit === 'stk') return amount;
    if (conv.stk != null) return amount * conv.stk;
    if (ing.gPerStk) return amount * ing.gPerStk;
    return null;
  }
  return fromBase(ing, amount * factor, kind);
}

// g or ml → the ingredient's unit.
function fromBase(ing, value, kind) {
  const conv = ing.convert ?? {};
  if (ing.unit === kind) return value;
  if (ing.unit === 'g' && kind === 'ml') return value * (conv.density ?? 1);
  if (ing.unit === 'ml' && kind === 'g') return value / (conv.density ?? 1);
  if (ing.unit === 'stk') {
    if (kind === 'ml' && conv.mlPerStk) return value / conv.mlPerStk;
    const g = ing.gPerStk ?? conv.gPerStk;
    if (g) return (kind === 'ml' ? value * (conv.density ?? 1) : value) / g;
  }
  return null;
}

// Water is free; a section heading ("Mornaysauce", "Til servering:") is not an ingredient.
const FREE = /^(koldt |kogende |varmt |lunkent |is)?vand$|^isterninger$|^kolde?$|pastavand|kogevand/;

// One line → { id, qty, optional } or { unmatched: name }, or { skip } for water
// and headings. Basisvarer without an amount ("salt og friskkværnet peber", "smør
// til stegning") get a small amount: they are not priced unless you buy them.
export function parseIngredient(raw) {
  const parsed = splitLine(raw);
  if (!parsed.name || FREE.test(parsed.name) || /:$/.test(raw.trim())) return { skip: true };
  if (/^salt\s*(og|&|\/|,)\s*.*peber$|^salt\/peber$/.test(parsed.name)) {
    return { id: 'salt', qty: 3, optional: true, also: 'peber' };
  }
  let id = matchName(parsed.name);
  // "1 tsk chili" is dried, "1 rød chili" is fresh.
  if (id === 'frisk_chili' && parsed.unit?.[0] === 'ml') id = 'chili';
  if (!id) return parsed.amount == null ? { skip: true, heading: parsed.name } : { unmatched: parsed.name, raw };
  const ing = INGREDIENTS[id];
  let qty = toIngredientUnit(parsed, id);
  if ((qty == null || qty <= 0) && ing.staple) qty = ing.unit === 'stk' ? 1 : 5;
  if (qty == null && parsed.amount == null) qty = ing.unit === 'stk' ? 1 : ing.normal[0] / 4;
  if (qty == null) return { unmatched: parsed.name, raw, reason: `kan ikke omregne ${parsed.unit?.[0]} til ${ing.unit}` };
  return { id, qty: round(qty), optional: parsed.optional };
}

const round = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 100) / 100);

// Hjemme: what's in the cupboard, per ingredient. Stored on the phone as
// prefs.pantry = { [ingredientId]: { amount, unit } }, where amount is in `unit`
// and null means "har nok" (enough for anything – the old "har hjemme").

// Units the user can type an amount in for an ingredient: its own, plus grams ↔
// pieces when we know what a piece weighs.
export function unitsFor(ing) {
  if (ing.unit === 'stk') return ing.gPerStk ? ['stk', 'g'] : ['stk'];
  if (ing.unit === 'g') return ing.gPerStk ? ['g', 'stk'] : ['g'];
  return [ing.unit];
}

// Amount in `unit` → amount in the ingredient's own unit (what recipes use).
export function toOwnUnit(amount, unit, ing) {
  if (amount == null) return Infinity;
  if (unit === ing.unit) return amount;
  if (unit === 'g' && ing.unit === 'stk' && ing.gPerStk) return amount / ing.gPerStk;
  if (unit === 'stk' && ing.unit === 'g' && ing.gPerStk) return amount * ing.gPerStk;
  return amount;
}

// The map pricing.js works with: { id: amount in own unit }.
export function pantryAmounts(pantry, ingredients) {
  const out = {};
  for (const [id, entry] of Object.entries(pantry ?? {})) {
    const ing = ingredients[id];
    if (ing) out[id] = toOwnUnit(entry.amount, entry.unit, ing);
  }
  return out;
}

// One step on the − / + buttons, sized to the unit and the amount.
export function stepFor(unit, amount) {
  if (unit === 'stk') return 1;
  if (amount >= 1000) return 250;
  if (amount >= 200) return 100;
  return 50;
}

// A sensible first amount: the pack size of a product picked from the search,
// otherwise the ingredient's normal pack.
export function startAmount(ing, product) {
  if (product?.amount > 0) {
    if (product.unit === 'pcs') return { amount: product.amount, unit: 'stk' };
    if (ing.unit !== 'stk') return { amount: Math.round(product.amount * 1000), unit: ing.unit };
    if (ing.gPerStk) return { amount: Math.round(product.amount * 1000), unit: 'g' };
  }
  return { amount: ing.normal[0], unit: ing.unit };
}

// Old "har hjemme" ids become "har nok" entries.
export function migrateAtHome(prefs) {
  if (!prefs.atHome?.length) return prefs;
  const pantry = { ...(prefs.pantry ?? {}) };
  for (const id of prefs.atHome) pantry[id] ??= { amount: null, unit: null };
  return { ...prefs, pantry, atHome: [] };
}

// Amount in the ingredient's own unit → amount in `unit` (the inverse of toOwnUnit).
export function fromOwnUnit(amount, unit, ing) {
  if (unit === ing.unit || !unit) return amount;
  if (unit === 'g' && ing.unit === 'stk' && ing.gPerStk) return amount * ing.gPerStk;
  if (unit === 'stk' && ing.unit === 'g' && ing.gPerStk) return amount / ing.gPerStk;
  return amount;
}

// Which of a dish's ingredients (basisvarer don't count) what you have covers.
// `have` is { id: amount in own unit } – Hjemme, or what is left of it once the
// week's dishes are made. With `people`, an ingredient only counts when there is
// enough of it for the dish at that size; without, any amount counts.
export function usesPantry(recipe, have, ingredients, people = null) {
  const factor = people ? people / recipe.serves : 0;
  return recipe.ingredients
    .filter(({ id, qty }) => have[id] > 0 && !ingredients[id]?.staple && (!people || have[id] + 1e-6 >= qty * factor))
    .map(({ id }) => id);
}

const roundFor = (unit) => (unit === 'stk' ? (x) => Math.round(x * 10) / 10 : (x) => Math.round(x));

// A new avis week: the old week's dishes are taken as made. What they took from
// Hjemme comes off it, and what is left of every bag you ticked off as bought
// goes into it. Untouched Hjemme entries and "har nok" stay as they are.
// week: { plan, checked, bought: { id: amount bought, own unit } }; `fallback`
// gives what the list bought (list.needs) for ticks made before `bought` existed.
// Returns the new pantry and what was added, for a note in Hjemme.
export function carryOver(data, week, pantry = {}, fallback = {}) {
  const recipes = Object.fromEntries(data.recipes.map((r) => [r.id, r]));
  const need = {};
  for (const item of week.plan ?? []) {
    const recipe = recipes[item.recipeId];
    if (!recipe) continue;
    const factor = (item.people * item.days) / recipe.serves;
    for (const { id, qty } of recipe.ingredients) {
      const ing = data.ingredients[id];
      if (!ing || (ing.staple && !item.staples?.includes(id))) continue;
      need[id] = (need[id] ?? 0) + qty * factor;
    }
  }
  const out = { ...pantry };
  const added = [];
  const checked = new Set(week.checked ?? []);
  for (const [id, n] of Object.entries(need)) {
    const ing = data.ingredients[id];
    const entry = pantry[id];
    if (entry?.amount === null) continue; // har nok
    const have = entry ? toOwnUnit(entry.amount, entry.unit, ing) : 0;
    const used = Math.min(n, have);
    let left = have - used;
    const bought = checked.has(id) ? (week.bought?.[id] ?? fallback[id]?.bought ?? 0) : 0;
    const rest = Math.max(0, bought - (n - used));
    left += rest;
    const unit = entry?.unit ?? ing.unit;
    const amount = roundFor(unit)(fromOwnUnit(left, unit, ing));
    if (amount > 0) out[id] = { amount, unit };
    else delete out[id];
    const shown = roundFor(unit)(fromOwnUnit(rest, unit, ing));
    if (shown > 0) added.push({ id, amount: shown, unit });
  }
  return { pantry: out, added };
}

export function formatAmount(amount, unit) {
  if (amount == null) return 'Har nok';
  if (unit === 'g' && amount >= 1000) return `${(amount / 1000).toLocaleString('da-DK')} kg`;
  if (unit === 'ml' && amount >= 1000) return `${(amount / 1000).toLocaleString('da-DK')} l`;
  return `${amount.toLocaleString('da-DK')} ${unit}`;
}

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

// Dishes that use what you have, most of it first: how many pantry ingredients a
// dish uses (basisvarer don't count) and which.
export function usesPantry(recipe, pantry, ingredients) {
  return recipe.ingredients
    .map(({ id }) => id)
    .filter((id) => pantry[id] && !ingredients[id]?.staple);
}

export function formatAmount(amount, unit) {
  if (amount == null) return 'Har nok';
  if (unit === 'g' && amount >= 1000) return `${(amount / 1000).toLocaleString('da-DK')} kg`;
  if (unit === 'ml' && amount >= 1000) return `${(amount / 1000).toLocaleString('da-DK')} l`;
  return `${amount.toLocaleString('da-DK')} ${unit}`;
}

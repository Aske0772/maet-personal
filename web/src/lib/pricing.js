// All price maths lives here so swipe cards, the add sheet, the week view and the
// shopping list agree. Everything is "what you pay at the till": you buy whole
// packs, so 450 g of chicken from a 400 g offer costs two packs.
//
// Where a price comes from, best first:
//   tilbud    – this week's avis in one of your stores
//   fast      – a long-running catalog price in one of your stores
//   hylde     – a shelf price (REMA 1000, Lidl, Nemlig.com) in one of your stores
//   reference – the cheapest shelf price elsewhere, when your stores have none (approximate)
//   estimate  – our own estimate, only when no real price exists (approximate)

const EPS = 1e-9;
const packsFor = (need, packSize) => Math.max(1, Math.ceil(need / packSize - EPS));
export const isExact = (source) => ['tilbud', 'fast', 'hylde'].includes(source?.kind);

// What you have at home, per ingredient, in its own unit. `atHome` is either the
// Hjemme map ({ id: amount }, Infinity = "har nok") or a plain list of ids (har nok).
export function homeMap(atHome = []) {
  if (Array.isArray(atHome)) return Object.fromEntries(atHome.map((id) => [id, Infinity]));
  return atHome ?? {};
}
const haveOf = (home, id) => home[id] ?? 0;

// Real prices for an ingredient in the chosen stores.
export function offersFor(data, ingredientId, stores) {
  return (data.offers[ingredientId] ?? []).filter((o) => stores.includes(o.store));
}

// A bigger pack wins over the cheapest total when it costs only a little more and
// is clearly cheaper per kg/l: 1 l milk rather than 2 × 0,25 l, a bag of carrots
// rather than four loose ones.
const BIGGER_PACK_KR = 4;
const BIGGER_PACK_SHARE = 0.3;
const BIGGER_PACK_UNIT = 0.75;

const best = (candidates, need, kindOf) => {
  const options = candidates.map((offer) => {
    const packs = packsFor(need, offer.amount);
    return { offer, packs, cost: packs * offer.price, per: offer.price / offer.amount };
  });
  if (options.length === 0) return null;
  const cheapestTotal = options.reduce((a, b) => (b.cost < a.cost - EPS ? b : a));
  const room = Math.max(BIGGER_PACK_KR, cheapestTotal.cost * BIGGER_PACK_SHARE);
  const better = options
    .filter((o) => o.cost - cheapestTotal.cost <= room + EPS && o.per <= cheapestTotal.per * BIGGER_PACK_UNIT)
    .sort((a, b) => a.per - b.per || a.cost - b.cost)[0];
  const w = better ?? cheapestTotal;
  return { kind: kindOf(w.offer), offer: w.offer, packs: w.packs, packSize: w.offer.amount, cost: w.cost };
};

// Cheapest way to buy `need` units at a real price in your stores; otherwise the
// closest real reference; otherwise an estimate.
export function cheapest(data, ingredientId, need, stores) {
  const exact = best(offersFor(data, ingredientId, stores), need, (o) => o.kind ?? 'tilbud');
  if (exact) return exact;
  const shelf = (data.offers[ingredientId] ?? []).filter((o) => o.kind === 'hylde');
  const reference = best(shelf, need, () => 'reference');
  if (reference) return reference;
  const [normalSize, normalPrice] = data.ingredients[ingredientId].normal;
  const packs = packsFor(need, normalSize);
  return { kind: 'estimate', packs, packSize: normalSize, cost: packs * normalPrice };
}

// Running avis tilbud on a dish's hero ingredients in the chosen stores.
export function heroOffers(data, recipe, stores) {
  return recipe.hero.flatMap((id) =>
    offersFor(data, id, stores)
      .filter((o) => (o.kind ?? 'tilbud') === 'tilbud')
      .map((offer) => ({ ingredientId: id, offer }))
  );
}

export function isOnOffer(data, recipe, stores) {
  return heroOffers(data, recipe, stores).length > 0;
}

// Price one dish for a number of people and days.
// staples: ids of basisvarer the user needs to buy for this dish.
// atHome: what the user already has (see homeMap) – only the rest is bought.
export function priceDish(data, recipe, { people, days, staples = [], atHome = [], stores }) {
  const home = homeMap(atHome);
  const factor = (people * days) / recipe.serves;
  const lines = recipe.ingredients.map(({ id, qty }) => {
    const ing = data.ingredients[id];
    const need = qty * factor;
    const fromHome = Math.min(need, haveOf(home, id));
    const buy = need - fromHome;
    const included = (ing.staple ? staples.includes(id) : true) && buy > EPS;
    const source = included ? cheapest(data, id, buy, stores) : null;
    return { id, ing, need, fromHome, staple: ing.staple, included, source };
  });
  const total = lines.reduce((sum, l) => sum + (l.source?.cost ?? 0), 0);
  const approx = lines.reduce((sum, l) => sum + (l.source && !isExact(l.source) ? l.source.cost : 0), 0);
  const meals = people * days;
  return {
    total,
    approx,
    meals,
    perMeal: meals ? total / meals : 0,
    onOffer: lines.filter((l) => l.source?.kind === 'tilbud').length,
    bought: lines.filter((l) => l.source).length,
    lines
  };
}

// Cheapest price per portion for a typical household – used to sort the deck.
export function portionPrice(data, recipe, stores, people = 2, atHome = []) {
  return priceDish(data, recipe, { people, days: 1, stores, atHome }).perMeal;
}

// The week's shopping list. Needs are summed across dishes before choosing packs,
// so two dishes with carrots share one bag. Items without a real price in your
// stores go in the 'other' group. extras are products the user added by hand
// ("Tilføj vare"); they go in their store's group.
// shares: what each plan item costs as its part of the shared packs, so the
// dishes in the week add up to the list total instead of each paying a whole bag.
// adjust: packs bought beyond (or below) what the dishes need, per ingredient,
// from + and − on the list. Never below one pack; dish prices ignore it.
export function shoppingList(data, plan, { stores, atHome = [], extras = [], adjust = {} }) {
  const home = homeMap(atHome);
  const recipes = Object.fromEntries(data.recipes.map((r) => [r.id, r]));
  const needs = new Map();
  let meals = 0;
  for (const item of plan) {
    const recipe = recipes[item.recipeId];
    if (!recipe) continue;
    meals += item.people * item.days;
    const factor = (item.people * item.days) / recipe.serves;
    for (const { id, qty } of recipe.ingredients) {
      const ing = data.ingredients[id];
      if (ing.staple && !item.staples?.includes(id)) continue;
      const entry = needs.get(id) ?? { id, ing, need: 0, dishes: [], byItem: {} };
      entry.need += qty * factor;
      entry.byItem[item.id] = (entry.byItem[item.id] ?? 0) + qty * factor;
      if (!entry.dishes.includes(recipe.title)) entry.dishes.push(recipe.title);
      needs.set(id, entry);
    }
  }

  const items = [];
  const fromHome = [];
  for (const entry of needs.values()) {
    // What you have covers the dishes in plan order; only the rest is bought.
    const have = Math.min(entry.need, haveOf(home, entry.id));
    if (entry.need - have <= EPS) {
      fromHome.push({ ...entry, fromHome: have });
      continue;
    }
    items.push({ ...entry, fromHome: have, source: cheapest(data, entry.id, entry.need - have, stores) });
  }

  const shares = {};
  for (const i of items) {
    const perUnit = i.need > 0 ? i.source.cost / i.need : 0;
    for (const [itemId, need] of Object.entries(i.byItem)) shares[itemId] = (shares[itemId] ?? 0) + need * perUnit;
  }
  const dishTotal = items.reduce((sum, i) => sum + i.source.cost, 0);
  // + and − on a dish line change its packs; the difference is counted as extra shopping.
  let adjustTotal = 0;
  for (const i of items) {
    const d = Math.round(adjust[i.id] ?? 0);
    if (!d) continue;
    const packs = Math.max(1, i.source.packs + d);
    const cost = (i.source.cost / i.source.packs) * packs;
    adjustTotal += cost - i.source.cost;
    i.source = { ...i.source, packs, cost, adjusted: packs - (i.source.packs) };
  }
  const approx = items.reduce((sum, i) => sum + (isExact(i.source) ? 0 : i.source.cost), 0);
  const groups = new Map();
  const groupFor = (key) => {
    const group = groups.get(key) ?? { key, items: [], total: 0 };
    groups.set(key, group);
    return group;
  };
  for (const item of items) {
    const group = groupFor(isExact(item.source) ? item.source.offer.store : 'other');
    group.items.push(item);
    group.total += item.source.cost;
  }
  const byName = (a, b) => a.ing.cat.localeCompare(b.ing.cat) || a.ing.name.localeCompare(b.ing.name);
  for (const g of groups.values()) g.items.sort(byName);
  // Hand-added products come after the recipe items in their store, except one of
  // an ingredient already on the list (another brand of agurk): it goes right below it.
  let extrasTotal = adjustTotal;
  for (const x of extras) {
    const cost = x.price * x.qty;
    extrasTotal += cost;
    const group = groupFor(x.store);
    const row = { id: `x-${x.id}`, extra: x, source: { kind: x.kind, offer: x, packs: x.qty, cost } };
    let at = -1;
    if (x.ing) for (let k = group.items.length - 1; k >= 0 && at === -1; k--) {
      const it = group.items[k];
      if (it.id === x.ing || it.extra?.ing === x.ing) at = k + 1;
    }
    if (at === -1) group.items.push(row);
    else group.items.splice(at, 0, row);
    group.total += cost;
  }
  // Your stores in your order, other chains after them, items without a price last.
  const order = (key) => {
    if (key === 'other') return Infinity;
    const i = stores.indexOf(key);
    return i === -1 ? stores.length : i;
  };
  const sorted = [...groups.values()].sort((a, b) => order(a.key) - order(b.key));

  // spare: what is left once the week's dishes are made, per ingredient in its own
  // unit – the rest of a bought bag (spareFrom 'week') or of Hjemme ('home').
  // Infinity = "har nok". A new dish can only count on this much.
  const spare = {};
  const spareFrom = {};
  for (const [id, amount] of Object.entries(home)) {
    if (amount > EPS) { spare[id] = amount; spareFrom[id] = 'home'; }
  }
  for (const h of fromHome) {
    const left = haveOf(home, h.id) - h.need;
    if (left > EPS) spare[h.id] = left;
    else delete spare[h.id];
  }
  for (const i of items) {
    const left = i.source.packs * i.source.packSize + i.fromHome - i.need;
    if (left > EPS) { spare[i.id] = left; spareFrom[i.id] = 'week'; }
    else { delete spare[i.id]; delete spareFrom[i.id]; }
  }
  for (const id of Object.keys(spareFrom)) if (!(id in spare)) delete spareFrom[id];

  const total = dishTotal + extrasTotal;
  return {
    total, dishTotal, extrasTotal, approx, meals, perMeal: meals ? dishTotal / meals : 0, groups: sorted, home: fromHome, shares,
    // Needs per ingredient and what was bought for them (after + and −).
    needs: Object.fromEntries(items.map((i) => [i.id, { need: i.need, bought: i.source.packs * i.source.packSize }])),
    costs: Object.fromEntries(items.map((i) => [i.id, i.source.cost])),
    packSizes: Object.fromEntries(items.map((i) => [i.id, i.source.packSize])),
    spare, spareFrom
  };
}

// What adding a dish to the week really costs: the list total with it minus the
// list total without it. Shared packs (the carrots already in the bag) are free.
export function addedCost(data, plan, newItem, opts) {
  const before = shoppingList(data, plan, opts).dishTotal;
  const after = shoppingList(data, [...plan, { id: '__new', ...newItem }], opts).dishTotal;
  return Math.max(0, after - before);
}

// Where each ingredient of a new dish comes from next to the week: the rest of a
// bag the week already buys (fromWeek), Hjemme (fromHome), or the shop (buy), and
// what the shop part adds to the bill (cost). 600 g potatoes next to a dish that
// leaves 500 g in the bag: fromWeek 500, buy 100, cost = whatever the list now
// buys on top. `base` is the list without the dish, when the caller has it.
export function coverage(data, plan, newItem, opts, base = shoppingList(data, plan, opts)) {
  const recipe = data.recipes.find((r) => r.id === newItem.recipeId);
  if (!recipe) return { lines: [], total: 0 };
  const next = [...plan, { id: '__new', ...newItem }];
  const adjust = keepAdjust(data, plan, next, opts, base);
  const after = shoppingList(data, next, { ...opts, adjust });
  const factor = (newItem.people * newItem.days) / recipe.serves;
  const byId = new Map();
  for (const { id, qty } of recipe.ingredients) {
    const ing = data.ingredients[id];
    if (ing.staple && !newItem.staples?.includes(id)) continue;
    const line = byId.get(id) ?? { id, ing, need: 0 };
    line.need += qty * factor;
    byId.set(id, line);
  }
  const lines = [...byId.values()].map((l) => {
    const covered = Math.min(l.need, base.spare[l.id] ?? 0);
    const fromHome = base.spareFrom[l.id] === 'home' ? covered : 0;
    const buy = Math.max(0, l.need - covered);
    const cost = Math.max(0, (after.costs[l.id] ?? 0) - (base.costs[l.id] ?? 0));
    return { ...l, fromWeek: covered - fromHome, fromHome, buy: buy > 1e-6 ? buy : 0, cost };
  });
  // total, not dishTotal: extra packs from + count as bought.
  return { lines, total: Math.max(0, after.total - base.total) };
}

// + on the list buys packs beyond what the dishes need. When a new dish needs
// them, they become its packs instead of extra ones: 1 kg potatoes + 1 extra bag,
// then a 600 g dish → still two bags, no longer one of them extra. Returns the
// adjust to use for `next` (the plan with the new dish). − is left as it is.
export function keepAdjust(data, plan, next, opts, base = shoppingList(data, plan, opts)) {
  const adjust = opts.adjust ?? {};
  if (!Object.values(adjust).some((d) => d > 0)) return adjust;
  const raw = shoppingList(data, next, { ...opts, adjust: {} });
  const out = {};
  for (const [id, d] of Object.entries(adjust)) {
    if (!(d > 0) || !base.needs[id] || !raw.needs[id]) { if (d) out[id] = d; continue; }
    const size = raw.packSizes[id];
    const extra = Math.floor((base.needs[id].bought - raw.needs[id].bought) / size + EPS);
    if (extra > 0) out[id] = extra;
  }
  return out;
}

// A partly covered ingredient only counts when the rest covers a real part of it.
const PARTIAL_SHARE = 0.25;

// Dishes that use what the week leaves over. For every dish not in the plan: which
// ingredients the rest covers fully (shared), which only partly (partial: have
// of need, the shop buys the difference), and what it adds to the bill for one
// evening. Only dishes with at least `minShared` such ingredients count;
// cheapest per portion first.
export function suggestions(data, plan, { stores, atHome = [], adjust = {}, people = 2, filter = () => true, minShared = 2, limit = 3 }) {
  if (plan.length === 0) return [];
  const opts = { stores, atHome, adjust };
  const base = shoppingList(data, plan, opts);
  const planned = new Set(plan.map((p) => p.recipeId));
  const out = [];
  for (const recipe of data.recipes) {
    if (planned.has(recipe.id) || !filter(recipe)) continue;
    const quick = recipe.ingredients.filter(({ id }) => !data.ingredients[id].staple && base.spare[id] > 0).length;
    if (quick < minShared) continue;
    const cov = coverage(data, plan, { recipeId: recipe.id, people, days: 1, staples: [] }, opts, base);
    const lines = cov.lines.filter((l) => !l.ing.staple);
    const shared = lines.filter((l) => l.buy === 0).map((l) => l.id);
    const partial = lines
      .filter((l) => l.buy > 0 && l.fromWeek + l.fromHome >= PARTIAL_SHARE * l.need)
      .map((l) => ({ id: l.id, have: l.fromWeek + l.fromHome, need: l.need }));
    if (shared.length + partial.length < minShared) continue;
    out.push({ recipe, shared, partial, cost: cov.total, perMeal: cov.total / people });
  }
  return out.sort((a, b) => a.perMeal - b.perMeal || b.shared.length - a.shared.length).slice(0, limit);
}

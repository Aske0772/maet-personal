// Deck order. The deck should feel new every week without the user doing
// anything: cheap dishes first, deep discounts pulled forward, and dishes the
// user cooked in the last couple of weeks pushed to the back.

// How much a discount moves a dish forward: a 40 % discount makes the portion
// price count as 20 % lower when sorting.
export const DEPTH_WEIGHT = 0.5;
// Dishes planned in this many earlier weeks go to the back of the deck…
export const ROTATION_WEEKS = 2;
// …unless a hero ingredient is at least this much off: a great tilbud may come back.
export const COMEBACK_DEPTH = 0.5;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// What one unit of an ingredient normally costs: the median shelf price across
// chains when we have one, otherwise our own normal price.
function normalUnitPrice(data, ingredientId) {
  const shelf = (data.offers[ingredientId] ?? []).filter((o) => o.kind === 'hylde' && o.amount > 0);
  if (shelf.length) return median(shelf.map((o) => o.price / o.amount));
  const [size, price] = data.ingredients[ingredientId].normal;
  return price / size;
}

// How far below its normal price an offer is, 0–1. The before-price printed in
// the avis wins when there is one; it is by law the lowest price of the last 30 days.
export function offerDepth(data, ingredientId, offer) {
  if (!(offer.amount > 0) || !(offer.price > 0)) return 0;
  const unit = offer.price / offer.amount;
  const normal = offer.prePrice > offer.price ? offer.prePrice / offer.amount : normalUnitPrice(data, ingredientId);
  if (!(normal > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - unit / normal));
}

// The deepest discount among a dish's hero offers.
export function dishDepth(data, heroes) {
  return heroes.reduce((best, h) => Math.max(best, offerDepth(data, h.ingredientId, h.offer)), 0);
}

// items: [{ recipe, heroes, price }] as built by the deck.
// recent: ids of dishes planned in the last ROTATION_WEEKS weeks (lib/weeks.js recentDishes).
export function rankDeck(data, items, { recent = new Set() } = {}) {
  return items
    .map((item) => {
      const depth = dishDepth(data, item.heroes);
      return {
        ...item,
        depth,
        score: item.price * (1 - DEPTH_WEIGHT * depth),
        resting: recent.has(item.recipe.id) && depth < COMEBACK_DEPTH
      };
    })
    .sort((a, b) =>
      (a.resting - b.resting) || (a.score - b.score) || a.recipe.title.localeCompare(b.recipe.title, 'da')
    );
}

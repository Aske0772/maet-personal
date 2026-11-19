// Shelf prices: REMA 1000's public webshop API lists the whole assortment with
// current prices and validity dates. We use it as the real "normal price" for
// ingredients that aren't on offer. Same prototype caveat as tjek.js. Only facts
// are kept (name, pack size, price, validity); no images.

import { politeFetch } from './http.js';
import { parseSize } from './size.js';

export { parseSize };

const BASE = 'https://api.digital.rema1000.dk/api/v3';
// Every department. Food departments are matched to recipes; the others (household,
// baby, personal care, kiosk) are only for "Tilføj vare". cat: the aisle chip, or
// null to let shelf-categories.js decide from the name.
export const DEPARTMENTS = {
  10: { cat: 'brod', food: true }, 20: { cat: 'gront', food: true }, 30: { cat: null, food: true },
  40: { cat: null, food: true }, 50: { cat: 'frost', food: true }, 60: { cat: 'mejeri', food: true },
  70: { cat: 'mejeri', food: true }, 80: { cat: null, food: true }, 90: { cat: 'drikke', food: true },
  100: { cat: 'husholdning', food: false }, 110: { cat: 'baby', food: false }, 120: { cat: 'pleje', food: false },
  130: { cat: 'snacks', food: true }, 140: { cat: 'andet', food: false }, 160: { cat: null, food: true }
};
export const REMA_STORE_ID = '11deC';

export async function fetchRemaShelf() {
  const products = [];
  for (const dept of Object.keys(DEPARTMENTS).map(Number)) {
    for (let page = 1; page < 50; page++) {
      const res = await politeFetch(`${BASE}/departments/${dept}/products?per_page=100&page=${page}`, {
        label: `REMA afdeling ${dept} side ${page}`
      });
      const body = await res.json();
      for (const p of body.data) {
        const product = normalizeProduct(p, dept);
        if (product) products.push(product);
      }
      if (page >= body.meta.pagination.last_page) break;
    }
  }
  return products;
}

// Only regular (non-campaign) prices: campaign prices already arrive via the avis.
export function normalizeProduct(p, dept = 80) {
  const price = p.prices?.find((x) => !x.is_campaign && !x.is_advertised);
  if (!price?.price) return null;
  return {
    id: `rema-${p.id}`,
    storeId: REMA_STORE_ID,
    heading: titleCase(p.name),
    description: p.underline ?? '',
    price: price.price,
    prePrice: null,
    quantity: parseSize(p.underline),
    image: null,
    runFrom: iso(price.starting_at),
    runTill: iso(price.ending_at),
    ...(DEPARTMENTS[dept] ?? { cat: null, food: true })
  };
}

const iso = (s) => (s ? new Date(s).toISOString() : null);
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

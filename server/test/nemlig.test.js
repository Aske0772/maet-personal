import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProduct, productsFromPage, leafCategories, aisleOf } from '../src/sources/nemlig.js';
import { parseSize } from '../src/sources/size.js';

const product = {
  id: '5062104', title: 'Abrikoser', description: '100 g / Nordthy', price: 1200, priceOriginal: null,
  availability: { type: 'Available' }, tracking: { item_category: 'Frugt-og-groent' }
};

test('reads Nemlig pack sizes', () => {
  assert.deepEqual(parseSize('100 g'), { unit: 'kg', amount: 0.1 });
  assert.deepEqual(parseSize('1,5 l'), { unit: 'l', amount: 1.5 });
  assert.deepEqual(parseSize('6 stk.'), { unit: 'pcs', amount: 6 });
  assert.deepEqual(parseSize('4 x 125 g'), { unit: 'kg', amount: 0.5 });
  assert.deepEqual(parseSize('75 cl'), { unit: 'l', amount: 0.75 });
});

test('normalizes a Nemlig product: øre to kr, size, brand', () => {
  const p = normalizeProduct(product, 'frugt-og-groent');
  assert.equal(p.id, 'nemlig-5062104');
  assert.equal(p.price, 12);
  assert.equal(p.prePrice, null);
  assert.deepEqual(p.quantity, { unit: 'kg', amount: 0.1 });
  assert.equal(p.description, '100 g / Nordthy');
  assert.equal(p.food, true);
  assert.equal(normalizeProduct({ ...product, price: 1000, priceOriginal: 1500 }).prePrice, 15);
  assert.equal(normalizeProduct({ ...product, availability: { type: 'SoldOut' } }), null);
});

test('non-food aisles are kept but marked', () => {
  assert.deepEqual(aisleOf('husholdning'), { cat: 'husholdning', food: false });
  assert.deepEqual(aisleOf('baby-og-boern'), { cat: 'baby', food: false });
  assert.deepEqual(aisleOf('drikkevarer'), { cat: 'drikke', food: true });
  assert.deepEqual(aisleOf('frugt-og-groent'), { cat: null, food: true });
});

test('reads products from the page state', () => {
  const state = { abc: { b: { requestedCategory: { totalCount: 1, items: [{ type: 'product', product }, { type: 'banner' }] } } } };
  const html = `<html><script id="ng-state" type="application/json">${JSON.stringify(state)}</script></html>`;
  const got = productsFromPage(html, 'frugt-og-groent');
  assert.equal(got.length, 1);
  assert.equal(got[0].heading, 'Abrikoser');
});

test('only the innermost categories are read', () => {
  const base = 'https://www.nemlig.com/kategori';
  assert.deepEqual(
    leafCategories([`${base}/frugt-og-groent`, `${base}/frugt-og-groent/frugt`, `${base}/frugt-og-groent/frugt/aebler`, `${base}/brod`]),
    ['/kategori/frugt-og-groent/frugt/aebler', '/kategori/brod']
  );
});

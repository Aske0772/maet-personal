import { describe, it, expect } from 'vitest';
import { toOwnUnit, pantryAmounts, startAmount, migrateAtHome, stepFor, unitsFor, usesPantry, carryOver, fromOwnUnit } from './pantry.js';

const loeg = { name: 'løg', unit: 'stk', gPerStk: 100, normal: [10, 12] };
const pasta = { name: 'pasta', unit: 'g', normal: [500, 10] };

describe('pantry', () => {
  it('converts grams to pieces when a piece has a weight', () => {
    expect(toOwnUnit(300, 'g', loeg)).toBe(3);
    expect(toOwnUnit(null, null, loeg)).toBe(Infinity);
    expect(unitsFor(loeg)).toEqual(['stk', 'g']);
    expect(unitsFor(pasta)).toEqual(['g']);
  });
  it('builds the map prices use', () => {
    expect(pantryAmounts({ loeg: { amount: 200, unit: 'g' }, pasta: { amount: 500, unit: 'g' }, gone: { amount: 1, unit: 'g' } }, { loeg, pasta }))
      .toEqual({ loeg: 2, pasta: 500 });
  });
  it('starts at the pack size of a picked product', () => {
    expect(startAmount(pasta, { amount: 0.5, unit: 'kg' })).toEqual({ amount: 500, unit: 'g' });
    expect(startAmount(loeg, { amount: 1, unit: 'kg' })).toEqual({ amount: 1000, unit: 'g' });
    expect(startAmount(pasta)).toEqual({ amount: 500, unit: 'g' });
  });
  it('turns the old "har hjemme" list into "har nok"', () => {
    expect(migrateAtHome({ atHome: ['loeg'], pantry: {} })).toEqual({ atHome: [], pantry: { loeg: { amount: null, unit: null } } });
  });
  it('steps sensibly', () => {
    expect(stepFor('stk', 3)).toBe(1);
    expect(stepFor('g', 100)).toBe(50);
    expect(stepFor('g', 500)).toBe(100);
  });
  it('finds what a dish uses from Hjemme, not basisvarer', () => {
    const recipe = { ingredients: [{ id: 'pasta' }, { id: 'salt' }, { id: 'loeg' }] };
    expect(usesPantry(recipe, { pasta: 500, salt: Infinity }, { pasta, loeg, salt: { staple: true } })).toEqual(['pasta']);
  });
});

describe('rester', () => {
  const kartofler = { name: 'kartofler', unit: 'g', normal: [1000, 15] };
  const data = {
    ingredients: { kartofler, loeg, pasta },
    recipes: [
      { id: 'a', serves: 2, ingredients: [{ id: 'kartofler', qty: 500 }, { id: 'loeg', qty: 1 }] },
      { id: 'b', serves: 2, ingredients: [{ id: 'kartofler', qty: 700 }] }
    ]
  };
  const plan = [{ id: 'p', recipeId: 'a', people: 2, days: 1, staples: [] }];

  it('counts only enough of an ingredient when people are given', () => {
    const recipe = data.recipes[1];
    expect(usesPantry(recipe, { kartofler: 300 }, data.ingredients, 2)).toEqual([]);
    expect(usesPantry(recipe, { kartofler: 700 }, data.ingredients, 2)).toEqual(['kartofler']);
    expect(usesPantry(recipe, { kartofler: 300 }, data.ingredients)).toEqual(['kartofler']);
  });

  it('puts the rest of a ticked-off bag into Hjemme', () => {
    const { pantry, added } = carryOver(data, { plan, checked: ['kartofler'], bought: { kartofler: 1000 } }, {});
    expect(pantry).toEqual({ kartofler: { amount: 500, unit: 'g' } });
    expect(added).toEqual([{ id: 'kartofler', amount: 500, unit: 'g' }]);
  });

  it('leaves bags that were not ticked off out', () => {
    expect(carryOver(data, { plan, checked: [], bought: {} }, {}).pantry).toEqual({});
  });

  it('takes what the dishes used off Hjemme, in the unit it was typed in', () => {
    const before = { kartofler: { amount: 800, unit: 'g' }, loeg: { amount: 300, unit: 'g' }, pasta: { amount: 500, unit: 'g' } };
    const { pantry, added } = carryOver(data, { plan, checked: [] }, before);
    expect(pantry).toEqual({ kartofler: { amount: 300, unit: 'g' }, loeg: { amount: 200, unit: 'g' }, pasta: { amount: 500, unit: 'g' } });
    expect(added).toEqual([]);
  });

  it('keeps "har nok" and removes what is used up', () => {
    const { pantry } = carryOver(data, { plan, checked: [] }, { kartofler: { amount: 400, unit: 'g' }, loeg: { amount: null, unit: null } });
    expect(pantry).toEqual({ loeg: { amount: null, unit: null } });
  });

  it('uses what the list bought for ticks without a stored amount', () => {
    const { pantry } = carryOver(data, { plan, checked: ['kartofler'] }, {}, { kartofler: { need: 500, bought: 1000 } });
    expect(pantry.kartofler.amount).toBe(500);
  });

  it('converts back to the unit typed in', () => {
    expect(fromOwnUnit(2, 'g', loeg)).toBe(200);
    expect(fromOwnUnit(500, 'stk', { unit: 'g', gPerStk: 250 })).toBe(2);
  });
});

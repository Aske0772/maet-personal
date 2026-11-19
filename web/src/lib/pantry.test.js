import { describe, it, expect } from 'vitest';
import { toOwnUnit, pantryAmounts, startAmount, migrateAtHome, stepFor, unitsFor, usesPantry } from './pantry.js';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, parseNumber, splitLine } from '../src/parse-ingredient.js';

const p = (line) => {
  const r = parseIngredient(line);
  return r.id ? [r.id, r.qty] : r;
};

test('reads amounts: fractions, ranges, decimals', () => {
  assert.equal(parseNumber('1½'), 1.5);
  assert.equal(parseNumber('½'), 0.5);
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(parseNumber('1/2'), 0.5);
  assert.deepEqual(p('2-3 gulerødder'), ['gulerod', 2.5]);
});

test('turns kitchen units into our units', () => {
  assert.deepEqual(p('1½ dl piskefløde'), ['flode', 150]);
  assert.deepEqual(p('5 dl hønsebouillon (gerne varm)'), ['bouillon', 1]);
  assert.deepEqual(p('2 fed hvidløg, presset'), ['hvidloeg', 2]);
  assert.deepEqual(p('1 dåse hakkede tomater'), ['hakkede_tomater', 400]);
  assert.deepEqual(p('1 dåse hvide bønner i chilisauce (ca. 400 g)'), ['bonner', 400]);
  assert.deepEqual(p('4 kyllingebryst'), ['kyllingebryst', 600]);
  assert.deepEqual(p('8 skiver agurk'), ['agurk', 0.53]);
  assert.deepEqual(p('12 rensede salatblade'), ['salat', 180]);
});

test('knows which thing it is', () => {
  assert.deepEqual(p('100 g. soltørrede tomater'), ['tomater', 100]);
  assert.deepEqual(p('150 g pastaost'), ['parmesan', 150]);
  assert.deepEqual(p('1 rød peber'), ['peberfrugt', 1]);
  assert.deepEqual(p('1 rød chili'), ['frisk_chili', 1]);
  assert.equal(parseIngredient('1 tsk chili').id, 'chili');
  assert.deepEqual(p('2 stk. oksemørbradbøffer'), ['oksestrimler', 300]);
  assert.deepEqual(p('250 g ravioli med fyld af spinat og ricotta'), ['pasta', 250]);
});

test('water and headings are skipped; staples without amount get a little', () => {
  assert.ok(parseIngredient('1 dl vand').skip);
  assert.ok(parseIngredient('Mornaysauce').skip);
  assert.deepEqual(p('salt og friskkværnet peber'), ['salt', 3]);
  assert.deepEqual(p('smør til stegning'), ['smor', 5]);
  assert.equal(parseIngredient('2 dl mælkesauce').unmatched, 'mælkesauce');
});

test('splits a line', () => {
  const s = splitLine('evt. 1 bundt frisk koriander, grofthakket');
  assert.equal(s.optional, true);
  assert.equal(s.amount, 1);
  assert.equal(s.unit[0], 'bundt');
  assert.equal(s.name, 'frisk koriander');
});

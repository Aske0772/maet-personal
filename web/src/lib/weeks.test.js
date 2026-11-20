import { describe, expect, it } from 'vitest';
import { addDays, onOrBefore, priceTime, rangeLabel, weekEnd, weekLength, weekday } from './dates.js';
import { layoutWeek } from './week.js';
import {
  addToHistory, archiveEntry, changeShopDay, avisMissing, avisStartDay, migrateHistory, migrateWeek, newWeek,
  nextWeekOf, pricesAt, recentDishes, rollWeeks
} from './weeks.js';

const SAT = 5;
const MON = 0;
const dish = (id, recipeId = id) => ({ id, recipeId, days: 1, people: 2, staples: [] });
const withPlan = (start, ...ids) => ({ ...newWeek(start), plan: ids.map((i) => dish(i)) });

describe('dates', () => {
  it('counts weekdays from Monday', () => {
    expect(weekday('2026-11-16')).toBe(MON);
    expect(weekday('2026-11-21')).toBe(SAT);
    expect(onOrBefore('2026-11-20', SAT)).toBe('2026-11-14');
    expect(onOrBefore('2026-11-21', SAT)).toBe('2026-11-21');
  });

  it('runs a week from one shopping day to the next', () => {
    expect(weekLength('2026-11-21', SAT)).toBe(7);
    expect(weekEnd('2026-11-21', SAT)).toBe('2026-11-28');
    // Switching from Monday to Saturday: the Monday week ends on Saturday.
    expect(weekLength('2026-11-16', SAT)).toBe(5);
    // Switching from Saturday to Monday: the week stretches to the Monday after.
    expect(weekLength('2026-11-21', MON)).toBe(9);
  });

  it('prices a coming week at noon on its shopping day, a running week now', () => {
    const now = new Date(2026, 10, 20, 8).getTime();
    expect(priceTime('2026-11-21', now)).toBe(new Date(2026, 10, 21, 12).getTime());
    expect(priceTime('2026-11-14', now)).toBe(now);
  });

  it('labels a range of evenings', () => {
    expect(rangeLabel('2026-11-16', 7)).toBe('16.–22. nov.');
    expect(rangeLabel('2026-11-28', 7)).toBe('28. nov.–4. dec.');
  });

  it('crosses daylight saving without losing a day', () => {
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
    expect(addDays('2027-03-27', 1)).toBe('2027-03-28');
  });
});

describe('rollWeeks', () => {
  it('starts the first week on the last shopping day', () => {
    const { weeks } = rollWeeks({ current: null, next: null }, '2026-11-20', SAT);
    expect(weeks.current.start).toBe('2026-11-14');
  });

  it('changes nothing inside the week', () => {
    const weeks = { current: withPlan('2026-11-14', 'a'), next: null };
    expect(rollWeeks(weeks, '2026-11-20', SAT).changed).toBe(false);
  });

  it('lets the coming week take over when the current one ends', () => {
    const weeks = { current: withPlan('2026-11-14', 'a'), next: withPlan('2026-11-21', 'b') };
    const r = rollWeeks(weeks, '2026-11-21', SAT);
    expect(r.ended.map((w) => w.plan[0].recipeId)).toEqual(['a']);
    expect(r.weeks.current.plan[0].recipeId).toBe('b');
    expect(r.weeks.current.start).toBe('2026-11-21');
    expect(r.weeks.next).toBeNull();
  });

  it('starts an empty week when nothing was planned ahead', () => {
    const r = rollWeeks({ current: withPlan('2026-11-14', 'a'), next: null }, '2026-11-23', SAT);
    expect(r.weeks.current).toEqual(newWeek('2026-11-21'));
    expect(r.ended).toHaveLength(1);
  });

  it('skips the weeks you were away and keeps only those with dishes', () => {
    const r = rollWeeks({ current: withPlan('2026-10-03', 'a'), next: null }, '2026-11-20', SAT);
    expect(r.weeks.current.start).toBe('2026-11-14');
    expect(r.ended).toHaveLength(1);
  });

  it('ends the week early when the shopping day moves earlier', () => {
    // A Monday week, and Saturday is now the shopping day: the week ends Friday night.
    const r = rollWeeks({ current: withPlan('2026-11-16', 'a'), next: null }, '2026-11-21', SAT);
    expect(r.weeks.current.start).toBe('2026-11-21');
  });

  it('puts the coming week right after the current one', () => {
    const weeks = { current: withPlan('2026-11-16', 'a'), next: withPlan('2026-11-23', 'b') };
    expect(nextWeekOf(weeks, SAT).start).toBe('2026-11-21');
    expect(nextWeekOf({ current: weeks.current, next: null }, MON)).toEqual(newWeek('2026-11-23'));
  });
});

describe('changeShopDay', () => {
  it('moves dishes past the new end of the week into the coming week', () => {
    // Monday week, dishes Monday and Saturday; Saturday becomes the shopping day.
    const current = { ...newWeek('2026-11-16'), plan: [{ ...dish('a'), day: 0 }, { ...dish('b'), day: 5 }], seen: ['a', 'b'] };
    const out = changeShopDay({ current, next: null }, MON, SAT, layoutWeek);
    expect(out.current.plan.map((p) => p.id)).toEqual(['a']);
    expect(out.next.start).toBe('2026-11-21');
    expect(out.next.plan).toEqual([{ ...dish('b'), day: 0 }]);
    expect(out.next.seen).toEqual(['b']);
  });

  it('leaves the weeks alone when everything still fits', () => {
    const weeks = { current: { ...newWeek('2026-11-16'), plan: [{ ...dish('a'), day: 0 }] }, next: null };
    expect(changeShopDay(weeks, MON, SAT, layoutWeek)).toBe(weeks);
  });
});

describe('stored data from before', () => {
  it('turns the ISO week into a week from its Monday', () => {
    const old = { week: '2026-W47', plan: [dish('a')], seen: ['a'], checked: [], extras: [], adjust: {}, bought: {} };
    const { current } = migrateWeek(old);
    expect(current.start).toBe('2026-11-16');
    expect(current.week).toBeUndefined();
    expect(current.plan).toHaveLength(1);
    expect(migrateWeek({ week: null })).toBeNull();
  });

  it('keeps old history as weeks with dishes', () => {
    const h = migrateHistory({ weeks: { '2026-W45': ['x'], '2026-W46': ['y', 'z'] } });
    expect(h.list.map((w) => w.start)).toEqual(['2026-11-09', '2026-11-02']);
    expect(h.list[0].plan.map((p) => p.recipeId)).toEqual(['y', 'z']);
    expect(h.weeks).toBeUndefined();
  });
});

describe('history', () => {
  it('keeps the newest week first and replaces a week stored twice', () => {
    let h = { list: [] };
    h = addToHistory(h, archiveEntry(withPlan('2026-11-07', 'a'), SAT, { total: 400.4, perMeal: 28, meals: 14 }));
    h = addToHistory(h, archiveEntry(withPlan('2026-11-14', 'b'), SAT, null));
    h = addToHistory(h, archiveEntry(withPlan('2026-11-14', 'c'), SAT, null));
    expect(h.list.map((w) => w.start)).toEqual(['2026-11-14', '2026-11-07']);
    expect(h.list[0].plan[0].recipeId).toBe('c');
    expect(h.list[1]).toMatchObject({ len: 7, total: 400 });
  });

  it('rests the dishes of the last weeks, the current one first when planning ahead', () => {
    const history = { list: [archiveEntry(withPlan('2026-11-07', 'a'), SAT), archiveEntry(withPlan('2026-10-31', 'b'), SAT)] };
    expect([...recentDishes(history, 2)]).toEqual(['a', 'b']);
    expect([...recentDishes(history, 2, withPlan('2026-11-14', 'c'))]).toEqual(['c', 'a']);
  });
});

describe('prices on a day', () => {
  const t = (d, h = 12) => new Date(2026, 10, d, h).toISOString();
  const data = {
    offers: {
      laks: [
        { id: 'now', from: t(14, 0), until: t(21, 0), kind: 'tilbud' },
        { id: 'next', from: t(21, 0), until: t(28, 0), kind: 'tilbud' },
        { id: 'shelf', from: null, until: null, kind: 'hylde' }
      ]
    },
    stores: [
      { id: 'netto', avis: [{ from: t(14, 0), until: t(21, 0), count: 300 }, { from: t(21, 0), until: t(28, 0), count: 280 }] },
      { id: 'rema', avis: [{ from: t(15, 0), until: t(22, 0), count: 200 }] },
      { id: 'nemlig', avis: [] }
    ]
  };

  it('keeps only prices valid then', () => {
    expect(pricesAt(data, Date.parse(t(20))).offers.laks.map((o) => o.id)).toEqual(['now', 'shelf']);
    expect(pricesAt(data, Date.parse(t(22))).offers.laks.map((o) => o.id)).toEqual(['next', 'shelf']);
  });

  it('names your stores whose avis for that day is not out', () => {
    const at = Date.parse(t(22));
    expect(avisMissing(data, ['netto', 'rema', 'nemlig'], at).map((s) => s.id)).toEqual(['rema']);
  });

  it('suggests the day most of your stores start their avis', () => {
    const now = Date.parse(t(20));
    expect(avisStartDay(data, ['netto'], now)).toBe(SAT);
    expect(avisStartDay(data, ['rema'], now)).toBe(6);
    expect(avisStartDay(data, ['nemlig'], now)).toBe(MON);
  });
});

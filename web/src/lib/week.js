// The week's dishes laid out on its evenings, the shopping day first. A week has
// 7 evenings, or 4–10 the week you change shopping day (see lib/dates.js).
// A plan item may carry `day` (0 = the first evening) and covers `days` evenings from there.
// Items without a day, or whose day is taken, go on the first free run of evenings.
import { DAY_NAMES, DAY_SHORT, addDays, weekday } from './dates.js';

// "Lør" and "Lørdag" for evening i of the week starting on `start`.
export const eveningShort = (start, i) => DAY_SHORT[weekday(addDays(start, i))];
export const eveningName = (start, i) => DAY_NAMES[weekday(addDays(start, i))];

const fits = (taken, start, len) =>
  start >= 0 && start + len <= taken.length && taken.slice(start, start + len).every((x) => x == null);

const take = (taken, start, len, id) => {
  for (let d = start; d < start + len; d++) taken[d] = id;
};

const firstFree = (taken, len) => {
  for (let s = 0; s + len <= taken.length; s++) if (fits(taken, s, len)) return s;
  return null;
};

// Free run closest to `near` (ties go to the later evening, so a dish rather slides down than up).
const nearestFree = (taken, len, near) => {
  for (let dist = 0; dist < taken.length; dist++) {
    if (fits(taken, near + dist, len)) return near + dist;
    if (fits(taken, near - dist, len)) return near - dist;
  }
  return null;
};

// → { starts: { [id]: day }, unplaced: [item] }
export function layoutWeek(plan, evenings = 7) {
  const taken = Array(evenings).fill(null);
  const starts = {};
  const later = [];
  for (const item of plan) {
    if (Number.isInteger(item.day) && fits(taken, item.day, item.days)) {
      take(taken, item.day, item.days, item.id);
      starts[item.id] = item.day;
    } else later.push(item);
  }
  const unplaced = [];
  for (const item of later) {
    const s = firstFree(taken, item.days);
    if (s == null) unplaced.push(item);
    else {
      take(taken, s, item.days, item.id);
      starts[item.id] = s;
    }
  }
  return { starts, unplaced };
}

// Move one dish to start on `to`. It always gets that evening (pulled earlier if it
// would run past the last evening). Dishes in the way go to the moved dish's old evening when
// they fit there, so two dishes swap; otherwise to the nearest free evening.
// Every placed dish gets an explicit day, so the layout stays put afterwards.
export function moveItem(plan, id, to, evenings = 7) {
  const moving = plan.find((p) => p.id === id);
  if (!moving || moving.days > evenings) return plan;
  const { starts } = layoutWeek(plan, evenings);
  const from = starts[id];
  const target = Math.max(0, Math.min(to, evenings - moving.days));
  const end = target + moving.days;

  const taken = Array(evenings).fill(null);
  take(taken, target, moving.days, id);
  const next = { [id]: target };

  const others = plan.filter((p) => p.id !== id);
  const placed = others.filter((p) => starts[p.id] != null).sort((a, b) => starts[a.id] - starts[b.id]);
  const overlaps = (p) => starts[p.id] < end && starts[p.id] + p.days > target;

  for (const p of placed.filter((p) => !overlaps(p))) {
    take(taken, starts[p.id], p.days, p.id);
    next[p.id] = starts[p.id];
  }
  const displaced = [...placed.filter(overlaps), ...others.filter((p) => starts[p.id] == null)];
  for (const p of displaced) {
    let s = from != null && fits(taken, from, p.days) ? from : null;
    if (s == null) s = starts[p.id] != null ? nearestFree(taken, p.days, starts[p.id]) : firstFree(taken, p.days);
    if (s != null) {
      take(taken, s, p.days, p.id);
      next[p.id] = s;
    }
  }

  return plan.map((p) => {
    const { day, ...rest } = p;
    return next[p.id] == null ? rest : { ...rest, day: next[p.id] };
  });
}

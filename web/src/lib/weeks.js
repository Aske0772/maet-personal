// The weeks you plan: the one you are in (current) and the coming one (next), each
// starting on your shopping day. Pure functions, so the rules can be tested.
import { isoDate, isoWeekMonday, onOrBefore, weekEnd, weekLength, weekday } from './dates.js';

// One week's state. plan items: { id, recipeId, days, people, staples, day? },
// day 0 = the shopping day (see lib/week.js). extras: products added by hand in
// "Tilføj vare". adjust: packs beyond what the dishes need, per ingredient (+ and −
// on the list). bought: what the list bought of an ingredient when it was ticked
// off, so the rest of the bag can go into Hjemme when the week ends.
export const EMPTY_WEEK = { plan: [], seen: [], checked: [], extras: [], adjust: {}, bought: {} };
export const newWeek = (start) => ({ ...EMPTY_WEEK, start });
export const isEmptyWeek = (w) => !w || (w.plan.length === 0 && w.extras.length === 0);

// The coming week always starts where the current one ends. It exists as soon as
// you open it; it is only stored once you put something in it.
export function nextWeekOf(weeks, shopDay) {
  const start = weekEnd(weeks.current.start, shopDay);
  return weeks.next ? { ...weeks.next, start } : newWeek(start);
}

// Move on to the week `today` is in. A week whose last evening has passed has
// ended: the coming week becomes the current one (or a new one starts on your
// shopping day). Returns the weeks and the ended weeks that had something in them,
// oldest first. Changes nothing when today is still in the current week.
export function rollWeeks(weeks, today, shopDay) {
  let current = weeks.current;
  let next = weeks.next ?? null;
  const ended = [];
  if (!current) {
    return { weeks: { current: newWeek(onOrBefore(today, shopDay)), next: null }, ended, changed: true };
  }
  let changed = false;
  while (today >= weekEnd(current.start, shopDay)) {
    changed = true;
    if (!isEmptyWeek(current)) ended.push(current);
    const start = weekEnd(current.start, shopDay);
    current = next ? { ...next, start } : newWeek(start);
    next = null;
    // Away for weeks: skip the empty ones and start on the last shopping day.
    if (isEmptyWeek(current) && today >= weekEnd(current.start, shopDay)) {
      current = newWeek(onOrBefore(today, shopDay));
    }
  }
  return { weeks: { current, next }, ended, changed };
}

// A new shopping day moves where the current week ends. Dishes on evenings it no
// longer has go to the coming week, on the same evening there.
export function changeShopDay(weeks, from, to, layout) {
  if (!weeks.current || from === to) return weeks;
  const oldLen = weekLength(weeks.current.start, from);
  const newLen = weekLength(weeks.current.start, to);
  const { starts } = layout(weeks.current.plan, oldLen);
  const moves = weeks.current.plan.filter((p) => starts[p.id] != null && starts[p.id] + p.days > newLen);
  if (!moves.length) return weeks;
  const next = nextWeekOf(weeks, to);
  const moved = moves.map((p) => {
    const day = Math.max(0, starts[p.id] - newLen);
    return { ...p, day };
  });
  const ids = new Set(moves.map((p) => p.id));
  const recipeIds = new Set(moves.map((p) => p.recipeId));
  return {
    current: { ...weeks.current, plan: weeks.current.plan.filter((p) => !ids.has(p.id)), seen: weeks.current.seen.filter((id) => !recipeIds.has(id)) },
    next: { ...next, plan: [...next.plan, ...moved], seen: [...new Set([...next.seen, ...recipeIds])] }
  };
}

// Data stored before weeks started on the shopping day: one week keyed by its ISO
// week ("2026-W47"), Monday to Sunday. It becomes the current week from that Monday.
export function migrateWeek(old) {
  if (!old?.week) return null;
  const start = isoWeekMonday(old.week);
  if (!start) return null;
  const { week, ...rest } = old;
  return { current: { ...EMPTY_WEEK, ...rest, start }, next: null };
}

// What a week looks like once it is over, for the history and for resting dishes
// in the deck. total and perMeal are what the list said when the week ended.
export function archiveEntry(week, shopDay, list) {
  return {
    start: week.start,
    len: weekLength(week.start, shopDay),
    plan: week.plan.map(({ id, recipeId, days, people, staples, day }) => ({ id, recipeId, days, people, staples, day })),
    total: list ? Math.round(list.total) : null,
    perMeal: list ? list.perMeal : null,
    meals: list ? list.meals : null
  };
}

// Weeks kept on the phone, newest first.
export const HISTORY_KEEP = 26;
export function addToHistory(history, entry) {
  const list = [entry, ...(history.list ?? []).filter((w) => w.start !== entry.start)];
  return { ...history, list: list.slice(0, HISTORY_KEEP) };
}

// History stored before: { weeks: { "2026-W46": [recipeIds] } }. Kept as weeks
// with dishes but no days or prices.
export function migrateHistory(history) {
  if (!history?.weeks) return history;
  const old = Object.entries(history.weeks)
    .map(([key, ids]) => ({ start: isoWeekMonday(key), len: 7, plan: ids.map((recipeId, i) => ({ id: `old-${i}`, recipeId })), total: null, perMeal: null, meals: null }))
    .filter((w) => w.start);
  const list = [...(history.list ?? []), ...old]
    .filter((w, i, all) => all.findIndex((x) => x.start === w.start) === i)
    .sort((a, b) => (a.start < b.start ? 1 : -1))
    .slice(0, HISTORY_KEEP);
  return { list };
}

// Prices as they are at `time` (ms): tilbud that have started and not ended. The
// server sends next week's avis too, so the same data prices both weeks.
export function pricesAt(data, time) {
  const valid = (o) => (!o.from || Date.parse(o.from) <= time) && (!o.until || Date.parse(o.until) > time);
  const offers = {};
  for (const [id, list] of Object.entries(data.offers)) {
    const ok = list.filter(valid);
    if (ok.length) offers[id] = ok;
  }
  return { ...data, offers };
}

// Your stores whose avis does not cover `time` yet: the coming avis is not out.
// Stores without any avis (Nemlig.com's shelf prices) are left out.
export function avisMissing(data, stores, time) {
  return data.stores.filter((s) => stores.includes(s.id) && s.avis?.length
    && !s.avis.some((a) => Date.parse(a.from) <= time && Date.parse(a.until) > time));
}

// The weekday your stores' avis starts, for a first shopping day: per store the
// running avis with the most tilbud, then the day most of them start. Falls back
// to Monday.
export function avisStartDay(data, stores, now = Date.now()) {
  const votes = new Map();
  for (const s of data.stores) {
    if (!stores.includes(s.id)) continue;
    const running = (s.avis ?? []).filter((a) => Date.parse(a.from) <= now && Date.parse(a.until) > now);
    const main = running.sort((a, b) => b.count - a.count)[0];
    if (!main) continue;
    const day = weekday(isoDate(new Date(main.from)));
    votes.set(day, (votes.get(day) ?? 0) + 1);
  }
  let best = 0;
  let n = 0;
  for (const [day, count] of votes) if (count > n) { best = day; n = count; }
  return best;
}

// Dishes to rest in the deck: those planned in the last `count` weeks before the one
// you swipe for. Planning the coming week, the current week counts as the last.
export function recentDishes(history, count, current = null) {
  const weeks = [...(current ? [current] : []), ...(history.list ?? [])].slice(0, count);
  return new Set(weeks.flatMap((w) => w.plan.map((p) => p.recipeId)));
}

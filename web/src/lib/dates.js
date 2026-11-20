// Weeks that start on the day you shop. Dates are local calendar days as
// "YYYY-MM-DD" strings, so they survive storage and never drift with time zones.
// Weekdays count from Monday: 0 = mandag … 6 = søndag.

export const DAY_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
export const DAY_NAMES = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export const weekday = (s) => (parseDate(s).getDay() + 6) % 7;

// The last date on or before `s` that falls on weekday `wd`.
export const onOrBefore = (s, wd) => addDays(s, -((weekday(s) - wd + 7) % 7));

// A week runs from its shopping day to the next one: 7 evenings. When you change
// your shopping day, the week you are in ends at the new day instead, so it is
// 4–10 evenings and the weeks never overlap or leave a gap.
export function weekLength(start, shopDay) {
  const first = addDays(start, 4);
  return 4 + ((shopDay - weekday(first) + 7) % 7);
}
export const weekEnd = (start, shopDay) => addDays(start, weekLength(start, shopDay));

// Prices are those valid when you shop: noon on the shopping day, or now once that
// has passed. A week you are already in is priced as things stand.
export function priceTime(start, now = Date.now()) {
  const noon = parseDate(start);
  noon.setHours(12);
  return Math.max(now, noon.getTime());
}

// "16.–22. nov." or "28. nov.–4. dec." for the evenings start … start + len − 1.
export function rangeLabel(start, len) {
  const a = parseDate(start);
  const b = parseDate(addDays(start, len - 1));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}.–${b.getDate()}. ${MONTHS[b.getMonth()]}`;
  return `${a.getDate()}. ${MONTHS[a.getMonth()]}–${b.getDate()}. ${MONTHS[b.getMonth()]}`;
}

// "lørdag 28.11"
export function dayLabel(s) {
  const d = parseDate(s);
  return `${DAY_NAMES[weekday(s)].toLowerCase()} ${d.getDate()}.${d.getMonth() + 1}`;
}

// Monday of an ISO week key such as "2026-W46", for data stored before weeks had dates.
export function isoWeekMonday(key) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(key ?? '');
  if (!m) return null;
  const jan4 = new Date(Number(m[1]), 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (Number(m[2]) - 1) * 7);
  return isoDate(monday);
}

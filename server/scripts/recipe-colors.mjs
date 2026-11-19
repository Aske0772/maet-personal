// The main colour of each dish photo, for the swipe card's background before the
// photo shows, and a check that every photo loads from its source without a
// Referer. Run in GitHub Actions (.github/workflows/recipe-colors.yml):
//   node scripts/recipe-colors.mjs > data/recipe-colors.json
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const UA = 'Maet/0.1 (+https://github.com/Aske0772/maet-personal; billedtjek, personlig brug)';
const recipes = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const last = new Map();
const out = {};
for (const r of recipes) {
  if (!r.image) continue;
  const host = new URL(r.image).host;
  const wait = (last.get(host) ?? 0) + 700 - Date.now();
  if (wait > 0) await sleep(wait);
  last.set(host, Date.now());
  try {
    const res = await fetch(r.image, { headers: { 'User-Agent': UA }, referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) { out[r.id] = { status: res.status }; continue; }
    // The average of the middle of the picture: the food, not the table edge.
    const { width, height } = await sharp(buf).metadata();
    const { data } = await sharp(buf)
      .extract({ left: Math.round(width * 0.2), top: Math.round(height * 0.2), width: Math.round(width * 0.6), height: Math.round(height * 0.6) })
      .resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    const hex = `#${[...data.slice(0, 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    out[r.id] = { status: res.status, color: hex, kb: Math.round(buf.length / 1024), type: res.headers.get('content-type') };
  } catch (e) {
    out[r.id] = { status: 'error', error: e.message };
  }
}
const bad = Object.entries(out).filter(([, v]) => v.status !== 200);
console.error(`${Object.keys(out).length} billeder, ${bad.length} fejl`, bad.slice(0, 10));
process.stdout.write(JSON.stringify(out, null, 1));

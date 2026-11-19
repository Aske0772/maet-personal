// Pack sizes as shops print them, shared by the shelf sources.
// "530 GR. / KLASSISK" → { unit: 'kg', amount: 0.53 }; "4 X 125 GR." → 0.5 kg;
// "1,5 l" → 1.5 l; "6 stk." → 6 pcs. Anything after "/" (brand, variant) is ignored.
const UNITS = {
  GR: ['kg', 0.001], G: ['kg', 0.001], KG: ['kg', 1],
  ML: ['l', 0.001], CL: ['l', 0.01], DL: ['l', 0.1], LTR: ['l', 1], L: ['l', 1], LITER: ['l', 1],
  STK: ['pcs', 1], BDT: ['pcs', 1], PK: ['pcs', 1], DS: ['pcs', 1], PAK: ['pcs', 1], RL: ['pcs', 1], RULLER: ['pcs', 1]
};

export function parseSize(text) {
  if (!text) return null;
  const head = text.split('/')[0].trim().toUpperCase().replace(',', '.');
  const m = head.match(/^(?:(\d+)\s*X\s*)?(\d+(?:\.\d+)?)(?:\s*-\s*\d+(?:\.\d+)?)?\s*([A-ZÆØÅ]+)\.?/);
  if (!m) return null;
  const unit = UNITS[m[3]];
  if (!unit) return null;
  const count = m[1] ? Number(m[1]) : 1;
  return { unit: unit[0], amount: Math.round(count * Number(m[2]) * unit[1] * 1e6) / 1e6 };
}

// One polite HTTP client for every source.
//
// An honest User-Agent with a contact address, few sequential requests with a
// pause between them, and one retry that respects Retry-After.

const VERSION = '0.1';
const CONTACT = process.env.CONTACT_EMAIL
  ? `mailto:${process.env.CONTACT_EMAIL}`
  : 'https://github.com/Aske0772/maet-personal';
export const USER_AGENT = `Maet/${VERSION} (+${CONTACT}; prototype)`;

const MIN_GAP_MS = Number(process.env.FETCH_GAP_MS ?? 400);
const TIMEOUT_MS = 20000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastRequest = new Map(); // host → time of the previous request

// Sources are disabled with DISABLED_SOURCES=tjek,rema (comma separated), the
// kill switch to pull when someone asks us to stop or a source misbehaves.
export function isDisabled(source) {
  return (process.env.DISABLED_SOURCES ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).includes(source.toLowerCase());
}

// gap: a longer pause for hosts we read many pages from (never shorter than MIN_GAP_MS).
export async function politeFetch(url, { accept = 'application/json', label = url, gap = 0 } = {}) {
  const host = new URL(url).host;
  const wait = (lastRequest.get(host) ?? 0) + Math.max(MIN_GAP_MS, gap) - Date.now();
  if (wait > 0) await sleep(wait);

  let res = await request(url, accept);
  if (res.status === 503 || res.status === 429) {
    // Transient: one retry after the pause the server asks for (max 30 s).
    const retryAfter = Math.min(Number(res.headers.get('retry-after') ?? 5), 30);
    await sleep(retryAfter * 1000);
    res = await request(url, accept);
  }
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res;
}

async function request(url, accept) {
  const headers = { accept, 'user-agent': USER_AGENT };
  if (process.env.CONTACT_EMAIL) headers.from = process.env.CONTACT_EMAIL;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  lastRequest.set(new URL(url).host, Date.now());
  return res;
}

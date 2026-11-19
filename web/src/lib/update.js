// Keeps a home-screen web app current. iOS keeps a web app frozen in the background,
// and GitHub Pages caches files for a few minutes, so an old version can linger. When
// the app is opened or comes back into view it asks for version.json (never from a
// cache), and reloads once when a newer build is out. The ?v= on the reload gets a
// fresh index.html past any cache.
/* global __BUILD_ID__ */
const BUILD = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;
const MIN_GAP_MS = 60_000;
let lastCheck = 0;

export async function checkForUpdate() {
  if (BUILD === 'dev' || Date.now() - lastCheck < MIN_GAP_MS) return;
  lastCheck = Date.now();
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = await res.json();
    if (!build || build === BUILD) return;
    // Reload once per new build, so a cached old page can never make it loop.
    let tried = null;
    try { tried = sessionStorage.getItem('mad.reloadedFor'); } catch { /* private mode */ }
    if (tried === build) return;
    try { sessionStorage.setItem('mad.reloadedFor', build); } catch { /* private mode */ }
    const url = new URL(location.href);
    url.searchParams.set('v', build);
    location.replace(url.toString());
  } catch {
    /* offline: keep the version we have */
  }
}

export function watchForUpdates() {
  checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('pageshow', (e) => e.persisted && checkForUpdate());
}

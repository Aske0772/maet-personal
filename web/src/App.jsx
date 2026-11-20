import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWeek } from './lib/api.js';
import { usePersistent } from './lib/persist.js';
import { keepAdjust, shoppingList } from './lib/pricing.js';
import { ROTATION_WEEKS } from './lib/rank.js';
import { layoutWeek, moveItem } from './lib/week.js';
import { isoDate, priceTime, weekLength } from './lib/dates.js';
import {
  addToHistory, archiveEntry, avisMissing, changeShopDay, avisStartDay, migrateHistory, migrateWeek, newWeek, nextWeekOf,
  pricesAt, recentDishes, rollWeeks
} from './lib/weeks.js';
import { Onboarding } from './components/Onboarding.jsx';
import { SwipeView } from './components/SwipeView.jsx';
import { DishDetail } from './components/DishDetail.jsx';
import { WeekView } from './components/WeekView.jsx';
import { ListView } from './components/ListView.jsx';
import { HomeView } from './components/HomeView.jsx';
import { carryOver, migrateAtHome, pantryAmounts } from './lib/pantry.js';
import { StorePicker } from './components/StorePicker.jsx';
import { ShopDayPicker } from './components/ShopDayPicker.jsx';
import { Sheet, Stepper } from './components/ui.jsx';
import { Cards, Calendar, List, Home } from './components/icons.jsx';

// pantry: Hjemme, { [ingredientId]: { amount, unit } } – amount null means "har nok".
// shopDay: the weekday you shop (0 = mandag). Weeks run from it to the next (lib/dates.js).
const PREFS = { onboarded: false, stores: [], people: 2, diet: 'alle', atHome: [], pantry: {}, saved: [], budget: null, shopDay: null };
// The week you are in and the coming one, each from its shopping day (lib/weeks.js).
// Data from before, one ISO week in "mad.week", becomes the current week from its Monday.
const OLD_WEEK = (() => {
  try {
    return JSON.parse(localStorage.getItem('mad.week'));
  } catch {
    return null;
  }
})();
const WEEKS = migrateWeek(OLD_WEEK) ?? { current: null, next: null };
// Weeks that have ended, newest first: the history in Uge, and the dishes the deck rests.
const PAST = { list: [] };
const STALE_MS = 15 * 60_000;

// What is left of Hjemme once a week's dishes are made: what new dishes can use.
const leftOf = (list, fallback) =>
  (list ? Object.fromEntries(Object.entries(list.spare).filter(([id]) => list.spareFrom[id] === 'home')) : fallback);

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [storedPrefs, setPrefs] = usePersistent('mad.prefs', PREFS);
  // The old "har hjemme" list lives on as "har nok" entries in Hjemme.
  useEffect(() => {
    if (storedPrefs.atHome?.length) setPrefs(migrateAtHome);
  }, [storedPrefs.atHome, setPrefs]);
  // Every price in the app reads atHome: what Hjemme holds, in each ingredient's unit.
  const home = useMemo(
    () => (data ? pantryAmounts(storedPrefs.pantry, data.ingredients) : {}),
    [data, storedPrefs.pantry]
  );
  const setPantry = (fn) => setPrefs((p) => ({ ...p, pantry: fn(p.pantry ?? {}) }));
  const [weeks, setWeeks] = usePersistent('mad.weeks', WEEKS);
  const [past, setPast] = usePersistent('mad.history', PAST);
  // Which week Swipe, Uge and Indkøb work on, and which page Uge shows:
  // 1 = næste uge, 0 = denne uge, −n = n weeks back in the history.
  const [active, setActive] = useState('current');
  const [page, setPage] = useState(0);
  // The time prices and weeks go by. Moves on when the app comes back into view.
  const [clock, setClock] = useState(() => Date.now());
  const today = isoDate(new Date(clock));
  // Until you pick one: the day most of your stores start their avis.
  const shopDay = storedPrefs.shopDay ?? (data ? avisStartDay(data, storedPrefs.stores) : 0);
  const [tab, setTabState] = useState('swipe');
  // Uge opens on the week you work on, not on a week from the history.
  const setTab = (t) => {
    setTabState(t);
    setPage((p) => (p < 0 ? (active === 'next' ? 1 : 0) : p));
  };
  const [sheet, setSheet] = useState(null); // { recipe, item?, mode, fromSwipe? }
  const [storesOpen, setStoresOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const mainRef = useRef(null);

  useEffect(() => {
    let fetchedAt = 0;
    const load = () => {
      fetchedAt = Date.now();
      return fetchWeek({ onWaiting: () => setWaiting(true) }).then(setData);
    };
    load().catch((e) => setError(e.message));

    // Keep prices current: refetch when the app comes back into view or every 15 min.
    // A failed background refresh keeps the prices already shown.
    const refetchIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      setClock(Date.now());
      if (Date.now() - fetchedAt > STALE_MS) load().catch(() => {});
    };
    document.addEventListener('visibilitychange', refetchIfStale);
    const timer = setInterval(refetchIfStale, STALE_MS);
    return () => {
      document.removeEventListener('visibilitychange', refetchIfStale);
      clearInterval(timer);
    };
  }, []);

  // Data from before this version: the old history, the old week key, and Monday,
  // the shopping day that week was planned with.
  useEffect(() => {
    if (past.weeks) setPast(migrateHistory);
  }, [past.weeks, setPast]);
  useEffect(() => {
    if (!OLD_WEEK) return;
    const migrated = migrateWeek(OLD_WEEK);
    if (migrated && !weeks.current) setWeeks(migrated);
    if (storedPrefs.shopDay == null && migrated) setPrefs((p) => ({ ...p, shopDay: 0 }));
    try {
      localStorage.removeItem('mad.week');
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move on when a week's last evening has passed. An ended week counts as made:
  // what its dishes used comes off Hjemme, the rest of every bag ticked off as
  // bought goes into it, and the week goes into the history.
  useEffect(() => {
    if (!data || !storedPrefs.onboarded) return;
    if (storedPrefs.shopDay == null) setPrefs((p) => ({ ...p, shopDay }));
    const r = rollWeeks(weeks, today, shopDay);
    if (!r.changed) return;
    if (r.ended.length) {
      let pantry = storedPrefs.pantry ?? {};
      let hist = migrateHistory(past);
      const added = [];
      for (const w of r.ended) {
        const d = pricesAt(data, priceTime(w.start, clock));
        const atHome = pantryAmounts(pantry, data.ingredients);
        const old = shoppingList(d, w.plan, { stores: storedPrefs.stores, atHome, extras: w.extras, adjust: w.adjust });
        const out = carryOver(d, w, pantry, old.needs);
        pantry = out.pantry;
        added.push(...out.added);
        hist = addToHistory(hist, archiveEntry(w, shopDay, w.summary ?? old));
      }
      setPrefs((p) => ({ ...p, pantry, carried: added.length ? { week: r.weeks.current.start, items: added } : null }));
      setPast(hist);
    }
    setWeeks(r.weeks);
    setActive('current');
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, today, shopDay, storedPrefs.onboarded]);

  const current = weeks.current ?? newWeek(today);
  const next = nextWeekOf({ ...weeks, current }, shopDay);
  const state = active === 'next' ? next : current;
  const evenings = weekLength(state.start, shopDay);
  // Every change goes to the week you work on. The coming week is stored from its first change.
  const setState = (fn) => setWeeks((w) => {
    if (!w.current) return w;
    if (active === 'next') return { ...w, next: fn(nextWeekOf(w, shopDay)) };
    return { ...w, current: fn(w.current) };
  });

  // Prices as they are on each week's shopping day (now, once it has started).
  const currentData = useMemo(() => data && pricesAt(data, priceTime(current.start, clock)), [data, current.start, clock]);
  const nextData = useMemo(() => data && pricesAt(data, priceTime(next.start, clock)), [data, next.start, clock]);
  const weekData = active === 'next' ? nextData : currentData;

  const currentList = useMemo(
    () => (currentData ? shoppingList(currentData, current.plan, { stores: storedPrefs.stores, atHome: home, extras: current.extras, adjust: current.adjust }) : null),
    [currentData, current.plan, storedPrefs.stores, home, current.extras, current.adjust]
  );
  const currentLeft = useMemo(() => leftOf(currentList, home), [currentList, home]);
  // The coming week counts on what this week leaves of Hjemme. The rest of this
  // week's bags joins Hjemme when the week ends.
  const atHome = active === 'next' ? currentLeft : home;
  const prefs = useMemo(() => ({ ...storedPrefs, atHome }), [storedPrefs, atHome]);
  const nextList = useMemo(
    () => (active === 'next' && nextData ? shoppingList(nextData, next.plan, { stores: storedPrefs.stores, atHome: currentLeft, extras: next.extras, adjust: next.adjust }) : null),
    [active, nextData, next.plan, storedPrefs.stores, currentLeft, next.extras, next.adjust]
  );
  const list = active === 'next' ? nextList : currentList;
  const homeLeft = useMemo(() => leftOf(list, atHome), [list, atHome]);
  const week = { adjust: state.adjust, homeLeft };

  // What the running week costs, kept on it so the history shows the prices you shopped at.
  useEffect(() => {
    if (!currentList || !weeks.current || current.start > today) return;
    const summary = { total: currentList.total, perMeal: currentList.perMeal, meals: currentList.meals };
    const was = weeks.current.summary;
    if (was && was.total === summary.total && was.meals === summary.meals) return;
    setWeeks((w) => (w.current ? { ...w, current: { ...w.current, summary } } : w));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentList, today]);

  // The week you work on, for the views: its start, evenings and how to name it.
  const plannedWeek = {
    start: state.start, evenings, next: active === 'next', today, at: priceTime(state.start, clock),
    // Not started yet: shopping is still ahead, priced for that day.
    ahead: state.start > today,
    missing: data && state.start > today ? avisMissing(data, storedPrefs.stores, priceTime(state.start, clock)) : []
  };

  // Uge's pages: the history, this week and the coming one. Landing on this or the
  // coming week makes it the one Swipe and Indkøb work on.
  const goToPage = (n) => {
    setPage(n);
    if (n >= 0) setActive(n === 1 ? 'next' : 'current');
  };
  const recent = useMemo(
    () => recentDishes(past, ROTATION_WEEKS, active === 'next' ? current : null),
    [past, active, current]
  );

  const markSeen = (id) => setState((s) => ({ ...s, seen: [...s.seen, id] }));
  const unSee = (id) => setState((s) => ({ ...s, seen: s.seen.filter((x) => x !== id) }));

  const onSkip = (recipe) => {
    markSeen(recipe.id);
    setHistory((h) => [...h, recipe.id]);
  };
  const onLike = (recipe) => {
    markSeen(recipe.id);
    setSheet({ recipe, mode: 'add', fromSwipe: true });
  };
  const onUndo = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    unSee(last);
  };

  const closeSheet = useCallback(() => {
    // Closing after a right swipe without adding puts the card back on top.
    if (sheet?.fromSwipe) unSee(sheet.recipe.id);
    setSheet(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  // day: the evening picked in the dish view, or null to take the first free one.
  const confirm = ({ days, people, staples, day }) => {
    const { recipe, item } = sheet;
    setState((s) => {
      const id = item?.id ?? crypto.randomUUID();
      let plan = item
        ? s.plan.map((p) => (p.id === item.id ? { ...p, days, people, staples } : p))
        : [...s.plan, { id, recipeId: recipe.id, days, people, staples }];
      if (day != null) plan = moveItem(plan, id, day, evenings);
      const seen = s.seen.includes(recipe.id) ? s.seen : [...s.seen, recipe.id];
      // Extra packs from + become the new dish's packs, as its price promised.
      const adjust = item ? s.adjust : keepAdjust(weekData, s.plan, plan, { stores: prefs.stores, atHome: prefs.atHome, adjust: s.adjust });
      return { ...s, plan, seen, adjust };
    });
    setSheet(null);
  };

  // The new dish takes the old one's place, days and people; the old one goes back in the deck.
  const replace = (old, { staples }) => {
    const { recipe } = sheet;
    setState((s) => {
      const plan = s.plan.map((p) => (p.id === old.id ? { ...p, id: crypto.randomUUID(), recipeId: recipe.id, staples } : p));
      const seen = s.seen.filter((x) => x !== old.recipeId);
      return { ...s, plan, seen: seen.includes(recipe.id) ? seen : [...seen, recipe.id] };
    });
    setSheet(null);
  };

  const remove = () => {
    const { item, recipe } = sheet;
    setState((s) => ({ ...s, plan: s.plan.filter((p) => p.id !== item.id), seen: s.seen.filter((x) => x !== recipe.id) }));
    setSheet(null);
  };

  // Tapping + again buys one more; minus takes one off and removes the last.
  const addExtra = (item) => setState((s) => {
    const found = s.extras.find((x) => x.id === item.id);
    const extras = found
      ? s.extras.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x))
      : [...s.extras, { id: item.id, store: item.store, title: item.title, price: item.price, amount: item.amount,
          unit: item.unit, kind: item.kind, until: item.until, ing: item.ing ?? null, qty: 1 }];
    return { ...s, extras };
  });
  const removeExtra = (id) => setState((s) => ({
    ...s,
    extras: s.extras.flatMap((x) => (x.id !== id ? [x] : x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : [])),
    checked: s.checked.filter((c) => c !== `x-${id}`)
  }));

  // + and − on the list. A dish's ingredient never goes below one pack: the last −
  // means "har det hjemme". Basisvarer stop at one.
  const markAtHome = (id) => {
    setPantry((pantry) => ({ ...pantry, [id]: pantry[id] ?? { amount: null, unit: null } }));
    setState((s) => ({ ...s, adjust: { ...s.adjust, [id]: 0 } }));
  };
  const step = (item, d) => {
    if (item.extra) return d > 0 ? addExtra(item.extra) : removeExtra(item.extra.id);
    if (d < 0 && item.source.packs <= 1) return item.ing.staple ? undefined : markAtHome(item.id);
    setState((s) => ({ ...s, adjust: { ...s.adjust, [item.id]: (s.adjust?.[item.id] ?? 0) + d } }));
  };
  // A product from the search that a dish line already buys counts on that line,
  // so adding the same agurk gives "3 × Agurk" instead of a second row.
  const lines = list ? list.groups.flatMap((g) => g.items) : [];
  const lineOf = (productId) => lines.find((i) => !i.extra && i.source.offer?.id === productId);
  const countOf = (product) => {
    const line = lineOf(product.id);
    if (line) return { n: line.source.packs, home: !line.ing.staple };
    return { n: state.extras.find((x) => x.id === product.id)?.qty ?? 0, home: false };
  };
  const stepProduct = (product, d) => {
    const line = lineOf(product.id);
    if (line) return step(line, d);
    if (d > 0) addExtra(product);
    else removeExtra(product.id);
  };

  const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  if (error) {
    return (
      <div className="center-screen">
        <p className="deck-empty-title">Kunne ikke hente ugens tilbud</p>
        <p className="muted">{error}</p>
        <button type="button" className="primary" onClick={() => location.reload()}>Prøv igen</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="center-screen">
        <div className="loader" aria-hidden="true" />
        <p className="muted">{waiting ? 'Henter ugens tilbudsaviser … første gang tager det et minut' : 'Henter ugens tilbud …'}</p>
      </div>
    );
  }
  if (!prefs.onboarded) {
    return <Onboarding data={data} onDone={({ stores, people }) => setPrefs((p) => ({ ...p, stores, people, onboarded: true }))} />;
  }

  const days = state.plan.reduce((sum, i) => sum + i.days, 0);
  const pastWeek = page < 0 ? past.list?.[-page - 1] ?? null : null;

  return (
    <div className="app">
      <main className="main" ref={mainRef}>
        {tab === 'swipe' && (
          <SwipeView
            data={weekData} prefs={prefs} setPrefs={setPrefs} plan={state.plan} seen={state.seen} recent={recent} week={week}
            planned={plannedWeek}
            budgetLeft={prefs.budget && list ? prefs.budget - list.total : null}
            onSkip={onSkip} onLike={onLike} onUndo={onUndo} canUndo={history.length > 0}
            onOpen={(recipe) => setSheet({ recipe, mode: 'add' })}
            onStores={() => setStoresOpen(true)}
            onReset={() => setState((s) => ({ ...s, seen: s.seen.filter((id) => s.plan.some((p) => p.recipeId === id)) }))}
          />
        )}
        {tab === 'week' && (
          <WeekView
            data={weekData} plan={state.plan} prefs={prefs} list={list} scroller={mainRef} week={week}
            planned={plannedWeek} page={page} pastWeek={pastWeek} pastCount={past.list?.length ?? 0} shopDay={shopDay}
            onPage={goToPage}
            onOpen={(recipe, item) => setSheet({ recipe, item, mode: 'edit' })}
            onMove={(id, day) => setState((s) => ({ ...s, plan: moveItem(s.plan, id, day, evenings) }))}
            onSuggest={(recipe) => setSheet({ recipe, mode: 'add' })}
            onSwipe={() => setTab('swipe')}
            onBudget={(budget) => setPrefs((p) => ({ ...p, budget }))}
          />
        )}
        {tab === 'list' && (
          <ListView
            data={weekData} list={list} checked={state.checked} stores={prefs.stores} planned={plannedWeek}
            countOf={countOf} onStep={step} onStepProduct={stepProduct} onStores={() => setStoresOpen(true)}
            onCheck={(id) => setState((s) => {
              const bought = { ...(s.bought ?? {}) };
              if (s.checked.includes(id)) delete bought[id];
              else if (list.needs[id]) bought[id] = list.needs[id].bought;
              return { ...s, checked: toggleIn(s.checked, id), bought };
            })}
            onBackHome={(id) => setPantry((pantry) => { const nextPantry = { ...pantry }; delete nextPantry[id]; return nextPantry; })}
          />
        )}
        {tab === 'home' && (
          <HomeView
            data={weekData} prefs={prefs} pantry={storedPrefs.pantry ?? {}} onChange={setPantry} week={week}
            carried={storedPrefs.carried} onDismissCarried={() => setPrefs((p) => ({ ...p, carried: null }))}
            onOpen={(recipe) => setSheet({ recipe, mode: 'add' })}
          />
        )}
      </main>

      <nav className="tabbar" aria-label="Hovedmenu">
        <TabButton id="swipe" tab={tab} setTab={setTab} icon={<Cards />} label="Swipe" />
        <TabButton id="week" tab={tab} setTab={setTab} icon={<Calendar />} label="Uge" badge={days || null} />
        <TabButton id="home" tab={tab} setTab={setTab} icon={<Home />} label="Hjemme" badge={Object.keys(storedPrefs.pantry ?? {}).length || null} />
        <TabButton id="list" tab={tab} setTab={setTab} icon={<List />} label="Indkøb" />
      </nav>

      {sheet && (
        <DishDetail
          key={sheet.recipe.id + (sheet.item?.id ?? '')}
          data={weekData} recipe={sheet.recipe} item={sheet.item} mode={sheet.mode} prefs={prefs} plan={state.plan} week={week}
          planned={plannedWeek}
          saved={prefs.saved.includes(sheet.recipe.id)}
          onToggleSave={() => setPrefs((p) => ({ ...p, saved: toggleIn(p.saved, sheet.recipe.id) }))}
          onConfirm={confirm} onReplace={replace} onRemove={remove} onClose={closeSheet}
        />
      )}

      <Sheet open={storesOpen} onClose={() => setStoresOpen(false)} label="Butikker">
        <h2 className="sheet-title">Hvor handler du?</h2>
        <StorePicker
          stores={data.stores} selected={prefs.stores}
          onChange={(stores) => stores.length && setPrefs((p) => ({ ...p, stores }))}
        />
        <ShopDayPicker
          value={shopDay}
          onChange={(d) => {
            setWeeks((w) => changeShopDay(w, shopDay, d, layoutWeek));
            setPrefs((p) => ({ ...p, shopDay: d }));
          }}
        />
        <Stepper
          label="Personer som standard" value={prefs.people}
          onChange={(people) => setPrefs((p) => ({ ...p, people }))}
        />
        <p className="muted small">{data.stores.reduce((n, s) => n + s.offerCount, 0)} madvarer på tilbud lige nu</p>
        <button type="button" className="primary wide" onClick={() => setStoresOpen(false)}>Færdig</button>
      </Sheet>
    </div>
  );
}

function TabButton({ id, tab, setTab, icon, label, badge }) {
  return (
    <button
      type="button" className={`tab ${tab === id ? 'is-on' : ''}`}
      aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}
    >
      <span className="tab-icon">{icon}{badge ? <span className="badge">{badge}</span> : null}</span>
      <span className="tab-label">{label}</span>
    </button>
  );
}

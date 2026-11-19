import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWeek } from './lib/api.js';
import { usePersistent } from './lib/persist.js';
import { keepAdjust, shoppingList } from './lib/pricing.js';
import { archiveWeek } from './lib/rank.js';
import { moveItem } from './lib/week.js';
import { Onboarding } from './components/Onboarding.jsx';
import { SwipeView } from './components/SwipeView.jsx';
import { DishDetail } from './components/DishDetail.jsx';
import { WeekView } from './components/WeekView.jsx';
import { ListView } from './components/ListView.jsx';
import { HomeView } from './components/HomeView.jsx';
import { carryOver, migrateAtHome, pantryAmounts } from './lib/pantry.js';
import { StorePicker } from './components/StorePicker.jsx';
import { Sheet, Stepper } from './components/ui.jsx';
import { Cards, Calendar, List, Home } from './components/icons.jsx';

// pantry: Hjemme, { [ingredientId]: { amount, unit } } – amount null means "har nok".
const PREFS = { onboarded: false, stores: [], people: 2, diet: 'alle', atHome: [], pantry: {}, saved: [], budget: null };
// Weekly state is tagged with the ISO week and starts fresh when the avis changes.
// extras: products added by hand in "Tilføj vare" ({ id, store, title, price, amount, unit, kind, until, qty }).
// plan items: { id, recipeId, days, people, staples, day? } – day 0 = Monday, see lib/week.js.
// adjust: packs bought beyond what the dishes need, per ingredient (+ and − on the list).
// bought: what the list bought of an ingredient when it was ticked off, so the rest
// of the bag can go into Hjemme when the week ends.
const WEEK = { week: null, plan: [], seen: [], checked: [], extras: [], adjust: {}, bought: {} };
// Dishes planned in earlier weeks, so the deck can rest them for a while. Stays on the phone.
const PAST = { weeks: {} };

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
  const prefs = useMemo(() => ({ ...storedPrefs, atHome: home }), [storedPrefs, home]);
  const setPantry = (fn) => setPrefs((p) => ({ ...p, pantry: fn(p.pantry ?? {}) }));
  const [state, setState] = usePersistent('mad.week', WEEK);
  const [past, setPast] = usePersistent('mad.history', PAST);
  const [tab, setTab] = useState('swipe');
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
    const STALE_MS = 15 * 60_000;
    const refetchIfStale = () => {
      if (document.visibilityState === 'visible' && Date.now() - fetchedAt > STALE_MS) load().catch(() => {});
    };
    document.addEventListener('visibilitychange', refetchIfStale);
    const timer = setInterval(refetchIfStale, STALE_MS);
    return () => {
      document.removeEventListener('visibilitychange', refetchIfStale);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!data || state.week === data.week) return;
    // A new avis week: remember what was planned before starting fresh.
    setPast((p) => archiveWeek(p, state.week, state.plan.map((i) => i.recipeId)));
    // The old week's dishes count as made: what they used comes off Hjemme, and
    // the rest of every bag ticked off as bought goes into it.
    if (state.week && state.plan.length) {
      const old = shoppingList(data, state.plan, { stores: prefs.stores, atHome: prefs.atHome, adjust: state.adjust });
      setPrefs((p) => {
        const { pantry, added } = carryOver(data, state, p.pantry ?? {}, old.needs);
        return { ...p, pantry, carried: added.length ? { week: data.week, items: added } : null };
      });
    }
    setState({ ...WEEK, week: data.week });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, state.week, state.plan, setState, setPast]);

  const list = useMemo(
    () => (data ? shoppingList(data, state.plan, { stores: prefs.stores, atHome: prefs.atHome, extras: state.extras, adjust: state.adjust }) : null),
    [data, state.plan, prefs.stores, prefs.atHome, state.extras, state.adjust]
  );
  // What is left of Hjemme once the week's dishes are made: what new dishes can use.
  const homeLeft = useMemo(() => {
    if (!list) return home;
    return Object.fromEntries(Object.entries(list.spare).filter(([id]) => list.spareFrom[id] === 'home'));
  }, [list, home]);
  const week = { adjust: state.adjust, homeLeft };

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
      if (day != null) plan = moveItem(plan, id, day);
      const seen = s.seen.includes(recipe.id) ? s.seen : [...s.seen, recipe.id];
      // Extra packs from + become the new dish's packs, as its price promised.
      const adjust = item ? s.adjust : keepAdjust(data, s.plan, plan, { stores: prefs.stores, atHome: prefs.atHome, adjust: s.adjust });
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
  const atHome = (id) => {
    setPantry((pantry) => ({ ...pantry, [id]: pantry[id] ?? { amount: null, unit: null } }));
    setState((s) => ({ ...s, adjust: { ...s.adjust, [id]: 0 } }));
  };
  const step = (item, d) => {
    if (item.extra) return d > 0 ? addExtra(item.extra) : removeExtra(item.extra.id);
    if (d < 0 && item.source.packs <= 1) return item.ing.staple ? undefined : atHome(item.id);
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

  return (
    <div className="app">
      <main className="main" ref={mainRef}>
        {tab === 'swipe' && (
          <SwipeView
            data={data} prefs={prefs} setPrefs={setPrefs} plan={state.plan} seen={state.seen} past={past} week={week}
            budgetLeft={prefs.budget && list ? prefs.budget - list.total : null}
            onSkip={onSkip} onLike={onLike} onUndo={onUndo} canUndo={history.length > 0}
            onOpen={(recipe) => setSheet({ recipe, mode: 'add' })}
            onStores={() => setStoresOpen(true)}
            onReset={() => setState((s) => ({ ...s, seen: s.seen.filter((id) => s.plan.some((p) => p.recipeId === id)) }))}
          />
        )}
        {tab === 'week' && (
          <WeekView
            data={data} plan={state.plan} prefs={prefs} list={list} scroller={mainRef} week={week}
            onOpen={(recipe, item) => setSheet({ recipe, item, mode: 'edit' })}
            onMove={(id, day) => setState((s) => ({ ...s, plan: moveItem(s.plan, id, day) }))}
            onSuggest={(recipe) => setSheet({ recipe, mode: 'add' })}
            onSwipe={() => setTab('swipe')}
            onBudget={(budget) => setPrefs((p) => ({ ...p, budget }))}
          />
        )}
        {tab === 'list' && (
          <ListView
            data={data} list={list} checked={state.checked} stores={prefs.stores}
            countOf={countOf} onStep={step} onStepProduct={stepProduct}
            onCheck={(id) => setState((s) => {
              const bought = { ...(s.bought ?? {}) };
              if (s.checked.includes(id)) delete bought[id];
              else if (list.needs[id]) bought[id] = list.needs[id].bought;
              return { ...s, checked: toggleIn(s.checked, id), bought };
            })}
            onBackHome={(id) => setPantry((pantry) => { const next = { ...pantry }; delete next[id]; return next; })}
          />
        )}
        {tab === 'home' && (
          <HomeView
            data={data} prefs={prefs} pantry={storedPrefs.pantry ?? {}} onChange={setPantry} week={week}
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
          data={data} recipe={sheet.recipe} item={sheet.item} mode={sheet.mode} prefs={prefs} plan={state.plan} week={week}
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
        <Stepper
          label="Personer som standard" value={prefs.people}
          onChange={(people) => setPrefs((p) => ({ ...p, people }))}
        />
        <p className="muted small">Tilbud fra uge {data.week.split('-W')[1]} · {data.stores.reduce((n, s) => n + s.offerCount, 0)} madvarer på tilbud</p>
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

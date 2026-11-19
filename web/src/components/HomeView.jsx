import { useMemo, useState } from 'react';
import { fetchCatalog } from '../lib/api.js';
import { capitalize, krSmall, productSize, andList } from '../lib/format.js';
import { nameScore, wordsOf } from '../lib/search.js';
import { formatAmount, pantryAmounts, startAmount, stepFor, unitsFor, usesPantry } from '../lib/pantry.js';
import { portionPrice } from '../lib/pricing.js';
import { Minus, Plus, X } from './icons.jsx';

const LIMIT = 12;
const IDEAS = 6;

// Hjemme: what's in the cupboard. Search an ingredient (or a product that is one),
// set how much you have, and the dishes use it first: their price leaves it out.
export function HomeView({ data, prefs, pantry, onChange, onOpen }) {
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState('');
  const ings = data.ingredients;

  // Products are only a way to find the ingredient ("Barilla spaghetti" → pasta), so
  // the catalog loads the first time someone types.
  const load = () => {
    if (catalog) return;
    fetchCatalog().then(setCatalog).catch((e) => setLoadError(e.message));
  };

  const words = wordsOf(query);
  const hits = useMemo(() => {
    if (!words.length) return [];
    const found = new Map(); // ingredient id → { id, score, product }
    for (const [id, ing] of Object.entries(ings)) {
      const score = nameScore(ing.name, words);
      if (score != null) found.set(id, { id, score });
    }
    for (const p of catalog?.items ?? []) {
      if (!p.ing || !ings[p.ing] || !prefs.stores.includes(p.store)) continue;
      const score = nameScore(p.title, words);
      if (score == null) continue;
      const cur = found.get(p.ing);
      if (!cur) found.set(p.ing, { id: p.ing, score: score + 1, product: p });
      else if (!cur.product) cur.product = p;
    }
    return [...found.values()]
      .sort((a, b) => a.score - b.score || ings[a.id].name.localeCompare(ings[b.id].name))
      .slice(0, LIMIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, catalog, ings, prefs.stores]);

  const set = (id, entry) => onChange((p) => {
    const next = { ...p };
    if (entry) next[id] = entry;
    else delete next[id];
    return next;
  });
  const add = (id, product) => {
    if (!pantry[id]) set(id, startAmount(ings[id], product));
    setQuery('');
  };

  // Dishes that use the most of what you have, cheapest per portion after it.
  const amounts = useMemo(() => pantryAmounts(pantry, ings), [pantry, ings]);
  const ideas = useMemo(() => {
    if (!Object.keys(pantry).length) return [];
    return data.recipes
      .map((recipe) => ({ recipe, uses: usesPantry(recipe, pantry, ings) }))
      .filter((x) => x.uses.length > 0)
      .map((x) => ({ ...x, price: portionPrice(data, x.recipe, prefs.stores, prefs.people, amounts) }))
      .sort((a, b) => b.uses.length - a.uses.length || a.price - b.price)
      .slice(0, IDEAS);
  }, [data, pantry, ings, amounts, prefs.stores, prefs.people]);

  // What you have, by aisle.
  const groups = useMemo(() => {
    const byCat = new Map();
    for (const id of Object.keys(pantry)) {
      const ing = ings[id];
      if (!ing) continue;
      const list = byCat.get(ing.cat) ?? [];
      list.push(id);
      byCat.set(ing.cat, list);
    }
    const order = Object.keys(data.categories);
    return [...byCat.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([cat, ids]) => ({ cat, ids: ids.sort((a, b) => ings[a].name.localeCompare(ings[b].name)) }));
  }, [pantry, ings, data.categories]);

  const usedIn = useMemo(() => {
    const n = {};
    for (const r of data.recipes) for (const { id } of r.ingredients) n[id] = (n[id] ?? 0) + 1;
    return n;
  }, [data.recipes]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Hjemme</h1>
      </header>
      <p className="muted small home-intro">
        Skriv, hvad du har i køleskab og skab. Retterne bruger det først, og det trækkes fra prisen.
      </p>

      <section className="add-item" aria-label="Tilføj til Hjemme">
        <input
          type="search" className="add-search" placeholder="Søg fx spaghetti, løg, fløde"
          aria-label="Søg efter noget, du har hjemme" enterKeyHint="search" autoComplete="off"
          value={query} onFocus={load} onChange={(e) => { setQuery(e.target.value); load(); }}
        />
        {loadError && <p className="shop-group-hint">{loadError}</p>}
        {words.length > 0 && hits.length === 0 && (
          <p className="shop-group-hint">Ingen ingredienser hedder noget med "{query}".</p>
        )}
        {hits.length > 0 && (
          <ul className="shop-items">
            {hits.map(({ id, product }) => {
              const have = pantry[id];
              return (
                <li key={id} className="shop-item">
                  <span className="shop-text">
                    <span className="shop-name">{capitalize(ings[id].name)}</span>
                    <span className="shop-product">
                      {product ? `fx ${product.title} ${productSize(product.amount, product.unit) ?? ''}` : `${usedIn[id] ?? 0} retter bruger det`}
                    </span>
                  </span>
                  {have ? (
                    <span className="shop-kind">Har {formatAmount(have.amount, have.unit)}</span>
                  ) : (
                    <button type="button" className="add-btn" onClick={() => add(id, product)} aria-label={`Har ${ings[id].name} hjemme`}>
                      <Plus size={18} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {groups.length === 0 && words.length === 0 && (
        <div className="empty"><p>Intet her endnu. Søg efter det, du har, og angiv hvor meget.</p></div>
      )}

      {groups.map(({ cat, ids }) => (
        <section key={cat} className="shop-group" aria-label={data.categories[cat]}>
          <h2 className="shop-group-title"><span>{data.categories[cat]}</span></h2>
          <ul className="shop-items">
            {ids.map((id) => (
              <PantryRow key={id} ing={ings[id]} entry={pantry[id]} uses={usedIn[id] ?? 0} onSet={(e) => set(id, e)} />
            ))}
          </ul>
        </section>
      ))}

      {ideas.length > 0 && (
        <section className="shop-group" aria-label="Retter med det, du har">
          <h2 className="shop-group-title"><span>Retter med det, du har</span></h2>
          <ul className="shop-items">
            {ideas.map(({ recipe, uses, price }) => (
              <li key={recipe.id} className="shop-item">
                <button type="button" className="home-idea" onClick={() => onOpen(recipe)}>
                  <span className="shop-text">
                    <span className="shop-name">{recipe.title}</span>
                    <span className="shop-product">Bruger {andList(uses.map((u) => ings[u].name))}</span>
                  </span>
                  <span className="shop-price">{krSmall(price)}<small className="muted"> /portion</small></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// One thing you have: − amount + and, where it makes sense, g ↔ stk.
function PantryRow({ ing, entry, uses, onSet }) {
  const units = unitsFor(ing);
  const enough = entry.amount == null;
  const step = (d) => {
    if (enough) {
      if (d < 0) return onSet(null);
      return onSet(startAmount(ing));
    }
    const s = stepFor(entry.unit, entry.amount);
    const next = Math.max(0, Math.round((entry.amount + d * s) / s) * s);
    onSet(next > 0 ? { ...entry, amount: next } : null);
  };
  const switchUnit = () => {
    const unit = units[(units.indexOf(entry.unit) + 1) % units.length];
    const g = ing.gPerStk;
    const amount = unit === 'g' ? Math.round(entry.amount * g) : Math.max(1, Math.round(entry.amount / g));
    onSet({ amount, unit });
  };
  return (
    <li className="shop-item">
      <span className="shop-text">
        <span className="shop-name">{capitalize(ing.name)}</span>
        <span className="shop-product">{uses ? `${uses} retter bruger det` : 'Ingen retter bruger det'}</span>
      </span>
      <span className="shop-side">
        <span className="qty">
          <button type="button" aria-label={`Mindre ${ing.name}`} onClick={() => step(-1)}>
            {!enough && entry.amount <= stepFor(entry.unit, entry.amount) ? <X size={16} /> : <Minus size={16} />}
          </button>
          <span className="qty-n home-amount" aria-live="polite">{formatAmount(entry.amount, entry.unit)}</span>
          <button type="button" aria-label={`Mere ${ing.name}`} onClick={() => step(1)}><Plus size={16} /></button>
        </span>
        {!enough && units.length > 1 && (
          <button type="button" className="shop-pill home-unit" onClick={switchUnit} aria-label={`Angiv i ${units.find((u) => u !== entry.unit)}`}>
            {units.find((u) => u !== entry.unit)}
          </button>
        )}
      </span>
    </li>
  );
}

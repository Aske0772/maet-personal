import { useMemo, useState } from 'react';
import { fetchCatalog } from '../lib/api.js';
import { krPrice, productSize, unitPrice, sourceParts } from '../lib/format.js';
import { Plus } from './icons.jsx';
import { Qty } from './Qty.jsx';
import { norm, wordsOf, nameScore } from '../lib/search.js';

// Shown before the catalog has loaded; the catalog sends the same list.
const FALLBACK_CATS = {
  gront: 'Frugt & grønt', kod: 'Kød', fisk: 'Fisk', mejeri: 'Mejeri & æg', brod: 'Brød',
  kolonial: 'Kolonial', frost: 'Frost', drikke: 'Drikke', snacks: 'Snacks & søde sager',
  husholdning: 'Husholdning', pleje: 'Personlig pleje', baby: 'Baby', andet: 'Andet'
};
const LIMIT = 30;
// "Tilføj vare": search every food item in your stores this week and put it on
// the list yourself, for what no recipe covers (coffee, oats, a snack). The aisle
// chips narrow the search, or show an aisle on their own.
// countOf(product) → { n, home }: how many are on the list, also as part of a dish line.
export function AddItem({ stores, storesById, ingredients, countOf, onStep }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');

  // The catalog is big, so it is fetched the first time the field or a chip is used.
  const storeKey = stores.join(',');
  const [loadedFor, setLoadedFor] = useState('');
  const load = () => {
    if (catalog && loadedFor === storeKey) return;
    setLoadedFor(storeKey);
    setError('');
    fetchCatalog(stores).then(setCatalog).catch((e) => setError(e.message));
  };
  const items = catalog?.items ?? null;

  const words = wordsOf(query);
  const active = words.length > 0 || cat != null;
  const { hits, more } = useMemo(() => {
    if (!items || !active) return { hits: [], more: 0 };
    const found = [];
    for (const i of items) {
      if (!stores.includes(i.store) || (cat && i.cat !== cat)) continue;
      const score = nameScore(i.title, words);
      if (score == null) continue;
      // The real thing first: Letmælk is the ingredient mælk, Mælkesnitte is not.
      const ing = i.ing ? norm(ingredients[i.ing]?.name ?? '') : '';
      const isIngredient = ing && words.some((w) => ing.startsWith(w) || w.endsWith(ing));
      found.push({ i, rank: (isIngredient ? 0 : 1) * 10 + score });
    }
    const per = (i) => (i.amount > 0 && (i.unit === 'kg' || i.unit === 'l') ? i.price / i.amount : i.price);
    found.sort((a, b) => a.rank - b.rank || (a.i.kind !== 'tilbud') - (b.i.kind !== 'tilbud') || per(a.i) - per(b.i));
    return { hits: found.slice(0, LIMIT).map((f) => f.i), more: Math.max(0, found.length - LIMIT) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, cat, stores]);

  const cats = Object.entries(catalog?.categories ?? FALLBACK_CATS);

  return (
    <section className="add-item" aria-label="Tilføj vare">
      <h2 className="shop-group-title"><span>Tilføj vare</span></h2>
      <input
        type="search" className="add-search" placeholder="Søg fx kaffe, bleer, opvasketabs"
        aria-label="Søg efter en vare i dine butikker" enterKeyHint="search" autoComplete="off"
        value={query} onFocus={load} onChange={(e) => { setQuery(e.target.value); load(); }}
      />
      <div className="add-cats" role="group" aria-label="Kategorier">
        {cats.map(([id, name]) => (
          <button
            key={id} type="button" className={`add-cat ${cat === id ? 'is-on' : ''}`} aria-pressed={cat === id}
            onClick={() => { setCat(cat === id ? null : id); load(); }}
          >
            {name}
          </button>
        ))}
      </div>
      {error && <p className="shop-group-hint">{error}</p>}
      {active && !items && !error && <p className="shop-group-hint">Henter varer …</p>}
      {items && active && hits.length === 0 && (
        <p className="shop-group-hint">
          {words.length ? `Ingen varer i dine butikker hedder noget med "${query}"` : 'Ingen varer her i dine butikker'}
          {cat && words.length ? ` under ${catalog.categories?.[cat] ?? 'kategorien'}.` : '.'}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="shop-items">
          {hits.map((i) => {
            const { n, home } = countOf(i);
            const { store, note } = sourceParts({ kind: i.kind, offer: i }, storesById);
            return (
              <li key={i.id} className="shop-item">
                <span className="shop-text">
                  <span className="shop-name">{i.title}</span>
                  <span className="shop-product">
                    {[productSize(i.amount, i.unit), unitPrice(i.price, i.amount, i.unit)].filter(Boolean).join(' · ')}
                  </span>
                  <span className={`shop-kind ${i.kind}`}>{[store, note].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="shop-price">{krPrice(i.price)}</span>
                {n ? (
                  <Qty n={n} label={i.title} atMin={home ? 'home' : 'remove'} accent onStep={(d) => onStep(i, d)} />
                ) : (
                  <button type="button" className="add-btn" onClick={() => onStep(i, 1)} aria-label={`Tilføj ${i.title} til listen`}>
                    <Plus size={18} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 && <p className="shop-group-hint">{more} varer mere. {words.length ? 'Skriv mere' : 'Søg'} for at finde den rigtige.</p>}
    </section>
  );
}

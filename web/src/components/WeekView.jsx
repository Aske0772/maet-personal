import { useLayoutEffect, useRef } from 'react';
import { DishArt } from './ui.jsx';
import { Chevron } from './icons.jsx';
import { priceDish, suggestions } from '../lib/pricing.js';
import { kr, krSmall, updatedLabel, andList, partLabel } from '../lib/format.js';
import { layoutWeek, eveningName, eveningShort } from '../lib/week.js';
import { addDays, dayLabel, daysBetween, parseDate, rangeLabel } from '../lib/dates.js';
import { useHoldDrag } from '../lib/useHoldDrag.js';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// page: 1 = næste uge, 0 = denne uge, −n = n weeks back (pastWeek). The arrows in
// the header move between them; this and the coming week are the ones you plan.
export function WeekView({
  data, plan, prefs, list, scroller, onOpen, onMove, onSuggest, onSwipe, onBudget, week = {},
  planned, page = 0, pastWeek = null, pastCount = 0, onPage
}) {
  const recipes = Object.fromEntries(data.recipes.map((r) => [r.id, r]));
  const len = planned.evenings;
  const { starts, unplaced } = layoutWeek(plan, len);
  const placed = plan.filter((p) => starts[p.id] != null);
  const taken = Array(len).fill(false);
  for (const p of placed) for (let d = starts[p.id]; d < starts[p.id] + p.days; d++) taken[d] = true;
  const evenings = taken.filter(Boolean).length;

  // Dates for the day labels, and which evening is tonight.
  const dates = Array.from({ length: len }, (_, i) => parseDate(addDays(planned.start, i)));
  const today = daysBetween(planned.start, planned.today);

  // Dishes that reuse what the week already buys, for one evening at the usual head count.
  const ideas = suggestions(data, plan, {
    stores: prefs.stores, atHome: prefs.atHome, adjust: week.adjust, people: prefs.people,
    filter: (r) => !prefs.diet || prefs.diet === 'alle' || r.diet === prefs.diet
  });

  const gridRef = useRef(null);
  const flipFrom = useRef(null);
  const dayAt = (y) => {
    const rows = [...(gridRef.current?.querySelectorAll('[data-day]') ?? [])].map((el) => el.getBoundingClientRect());
    if (!rows.length || y < rows[0].top - 48 || y > rows.at(-1).bottom + 48) return null;
    const i = rows.findIndex((r) => y < r.bottom + 4);
    return i === -1 ? rows.length - 1 : i;
  };
  // Measure every card before the move, then slide them from there to their new evening.
  const drop = (id, day) => {
    if (!reducedMotion()) {
      flipFrom.current = Object.fromEntries(
        [...gridRef.current.parentElement.querySelectorAll('[data-id]')].map((el) => [el.dataset.id, el.getBoundingClientRect()])
      );
    }
    onMove(id, day);
  };
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!from || !gridRef.current) return;
    for (const el of gridRef.current.parentElement.querySelectorAll('[data-id]')) {
      const a = from[el.dataset.id];
      if (!a) continue;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      );
    }
  }, [plan]);

  const { drag, bind } = useHoldDrag({ scroller, dayAt, onDrop: drop });
  const target = drag?.target != null ? Math.max(0, Math.min(drag.target, len - drag.span)) : null;

  const card = (item, start) => {
    const recipe = recipes[item.recipeId];
    if (!recipe) return null;
    // Its part of the shared packs: two dishes with carrots share one bag and its price.
    const share = list.shares[item.id] ?? priceDish(data, recipe, { ...item, atHome: prefs.atHome, stores: prefs.stores }).total;
    const when = start == null
      ? `${item.days} ${item.days === 1 ? 'dag' : 'dage'}`
      : item.days === 1 ? eveningName(planned.start, start) : `${eveningShort(planned.start, start)}–${eveningShort(planned.start, start + item.days - 1)}`;
    return (
      <button
        type="button" className="week-item" onClick={() => onOpen(recipe, item)}
        aria-label={`${recipe.title}, ${when}. Hold nede for at flytte.`}
      >
        <DishArt recipe={recipe} className="week-bg" />
        <span className="week-shade" aria-hidden="true" />
        <span className="week-text">
          <span className="week-title">{recipe.title}</span>
          <span className="muted small">{when} · {item.people} pers.</span>
        </span>
        <span className="week-price">{kr(share)}</span>
        <Chevron size={18} className="muted" />
      </button>
    );
  };

  const head = (
    <WeekNav
      page={page} pastCount={pastCount} onPage={onPage}
      title={page === 1 ? 'Næste uge' : page === 0 ? 'Denne uge' : rangeLabel(pastWeek.start, pastWeek.len)}
      sub={page >= 0 ? `${rangeLabel(planned.start, len)} · ${evenings} af ${len} aftener` : pastSub(pastWeek)}
    />
  );

  if (page < 0) {
    return (
      <div className="page">
        {head}
        <PastWeek entry={pastWeek} recipes={recipes} into={planned.next ? 'næste uge' : 'denne uge'} onOpen={onSuggest} />
      </div>
    );
  }

  return (
    <div className="page">
      {head}
      <div className="week-bar" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${len}, 1fr)` }}>
        {taken.map((on, i) => <span key={i} className={on ? 'is-on' : ''} />)}
      </div>

      {plan.length === 0 ? (
        <div className="empty">
          <p>{planned.next ? 'Ingen retter i næste uge endnu.' : 'Ingen retter endnu.'}</p>
          {planned.ahead && (
            <p className="small">Du handler {dayLabel(planned.start)}, så priserne er dem, der gælder den dag.</p>
          )}
          {planned.missing?.length > 0 && (
            <p className="small">Den nye avis er ikke ude endnu hos {andList(planned.missing.map((s) => s.name))}.</p>
          )}
          <button type="button" className="primary" onClick={onSwipe}>{planned.next ? 'Find retter til næste uge' : 'Find ugens retter'}</button>
        </div>
      ) : (
        <>
          <div className="summary">
            <div className="summary-total">{kr(list.dishTotal)}</div>
            <div className="summary-sub">
              <strong>{krSmall(list.perMeal)}</strong> pr. person pr. måltid · {list.meals} måltider
            </div>
            <div className="summary-fresh">
              Priser opdateret {updatedLabel(data.refreshedAt)}
              {list.approx > 0 && ` · heraf ca. ${kr(list.approx)} vejledende`}
            </div>
            <Budget budget={prefs.budget} total={list.total} onChange={onBudget} />
          </div>
          <div className={`week-grid ${drag ? 'is-dragging' : ''}`} ref={gridRef}>
            {dates.map((date, i) => (
              <div
                key={i} data-day={i} style={{ gridRow: i + 1 }}
                className={`week-day ${i === today ? 'is-today' : ''} ${target != null && i >= target && i < target + drag.span ? 'is-target' : ''}`}
              >
                <span>{eveningShort(planned.start, i)}</span>
                <small>{i === today ? 'i dag' : `${date.getDate()}.`}</small>
              </div>
            ))}
            {taken.map((on, i) => !on && (
              <button key={`free-${i}`} type="button" className="week-free" style={{ gridRow: i + 1 }} onClick={onSwipe}>
                Ledig aften
              </button>
            ))}
            {target != null && (
              <div className="week-drop" style={{ gridRow: `${target + 1} / span ${drag.span}` }} aria-hidden="true" />
            )}
            {placed.map((item) => (
              <div key={item.id} className="week-slot" style={{ gridRow: `${starts[item.id] + 1} / span ${item.days}` }} {...bind(item.id, starts[item.id], item.days)}>
                {card(item, starts[item.id])}
              </div>
            ))}
          </div>
          {unplaced.length > 0 && (
            <section className="week-over" aria-label="Ikke plads i ugen">
              <h2 className="shop-group-title"><span>Ikke plads i ugen</span></h2>
              {unplaced.map((item) => (
                <div key={item.id} className="week-slot" {...bind(item.id, null, item.days)}>{card(item, null)}</div>
              ))}
              <p className="shop-group-hint">Træk en ret op på en aften, eller gør en anden ret kortere.</p>
            </section>
          )}
          <p className="muted small center">Hold en ret nede for at flytte den til en anden aften. Retter med samme varer deler pakkerne og prisen.</p>

          {ideas.length > 0 && (
            <section className="shop-group" aria-label="Brug det, du allerede har">
              <h2 className="shop-group-title"><span>Brug det, du allerede har</span></h2>
              <ul className="suggest-list">
                {ideas.map(({ recipe, shared, partial, cost, perMeal }) => (
                  <li key={recipe.id}>
                    <button type="button" className="suggest-item" onClick={() => onSuggest(recipe)}>
                      <DishArt recipe={recipe} className="suggest-art" />
                      <span className="shop-text">
                        <span className="shop-name">{recipe.title}</span>
                        {shared.length > 0 && (
                          <span className="suggest-have">Du har allerede {andList(shared.map((id) => data.ingredients[id].name))}</span>
                        )}
                        {partial.length > 0 && (
                          <span className="suggest-part">
                            Du har {andList(partial.map((p) => partLabel(p, data.ingredients[p.id])))} · resten købes
                          </span>
                        )}
                      </span>
                      <span className="suggest-price">
                        <strong>{cost < 0.5 ? 'Gratis' : `+${kr(cost)}`}</strong>
                        <small>{krSmall(perMeal)} pr. portion</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="shop-group-hint">Prisen er det, retten lægger oveni ugens indkøb for {prefs.people} pers. én aften.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ‹ Denne uge › – back through the history, forward to the coming week.
function WeekNav({ page, pastCount, onPage, title, sub }) {
  return (
    <header className="page-head week-nav">
      <button type="button" className="round" aria-label="Ugen før" disabled={-page >= pastCount} onClick={() => onPage(page - 1)}>
        <Chevron size={20} className="flip" />
      </button>
      <div className="week-nav-title" aria-live="polite">
        <h1>{title}</h1>
        <span className="muted small">{sub}</span>
      </div>
      <button type="button" className="round" aria-label="Ugen efter" disabled={page >= 1} onClick={() => onPage(page + 1)}>
        <Chevron size={20} />
      </button>
    </header>
  );
}

const pastSub = (w) => {
  const n = w.plan.length;
  return `${n} ${n === 1 ? 'ret' : 'retter'}${w.total != null ? ` · ${kr(w.total)}` : ''}`;
};

// A week that has ended: what you made and what it cost. Tap a dish to put it in
// the week you plan now.
function PastWeek({ entry, recipes, into, onOpen }) {
  const plan = entry.plan.filter((p) => recipes[p.recipeId]);
  // Weeks from before dates were kept have dishes but no evenings.
  const withDays = plan.every((p) => p.days);
  const { starts } = withDays ? layoutWeek(plan, entry.len) : { starts: {} };
  const row = (item, start) => {
    const recipe = recipes[item.recipeId];
    const when = start == null ? null : item.days === 1 ? eveningName(entry.start, start) : `${eveningShort(entry.start, start)}–${eveningShort(entry.start, start + item.days - 1)}`;
    return (
      <button type="button" className="week-item" onClick={() => onOpen(recipe)} aria-label={`${recipe.title}. Lav den igen i ${into}`}>
        <DishArt recipe={recipe} className="week-bg" />
        <span className="week-shade" aria-hidden="true" />
        <span className="week-text">
          <span className="week-title">{recipe.title}</span>
          {item.days && <span className="muted small">{[when, `${item.people} pers.`].filter(Boolean).join(' · ')}</span>}
        </span>
        <Chevron size={18} className="muted" />
      </button>
    );
  };

  if (plan.length === 0) return <div className="empty"><p>Ingen retter fra den uge.</p></div>;
  return (
    <>
      {entry.total != null && (
        <div className="summary">
          <div className="summary-total">{kr(entry.total)}</div>
          {entry.meals > 0 && (
            <div className="summary-sub"><strong>{krSmall(entry.perMeal)}</strong> pr. person pr. måltid · {entry.meals} måltider</div>
          )}
          <div className="summary-fresh">Priserne, som de var i ugen</div>
        </div>
      )}
      {withDays ? (
        <div className="week-grid">
          {Array.from({ length: entry.len }, (_, i) => (
            <div key={i} className="week-day" style={{ gridRow: i + 1 }}>
              <span>{eveningShort(entry.start, i)}</span>
              <small>{parseDate(addDays(entry.start, i)).getDate()}.</small>
            </div>
          ))}
          {plan.filter((p) => starts[p.id] != null).map((item) => (
            <div key={item.id} className="week-slot" style={{ gridRow: `${starts[item.id] + 1} / span ${item.days}` }}>
              {row(item, starts[item.id])}
            </div>
          ))}
        </div>
      ) : (
        <ul className="week-list">
          {plan.map((item) => <li key={item.id}>{row(item, null)}</li>)}
        </ul>
      )}
      <p className="muted small center">Tryk på en ret for at lave den igen i {into}.</p>
    </>
  );
}

// Ugebudget: what the week may cost, and how much of it the list uses (dishes
// and hand-added items). Empty field = no budget.
function Budget({ budget, total, onChange }) {
  const left = budget ? budget - total : null;
  const share = budget ? Math.min(1, total / budget) : 0;
  return (
    <div className="budget">
      <label className="budget-row">
        <span>Ugebudget</span>
        <span className="budget-input">
          <input
            type="number" inputMode="numeric" min="0" step="50" placeholder="Intet"
            value={budget ?? ''} aria-label="Ugebudget i kroner"
            onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))}
          />
          kr
        </span>
      </label>
      {budget ? (
        <>
          <div className={`shop-progress ${left < 0 ? 'is-over' : ''}`} role="progressbar" aria-label="Brugt af budgettet"
            aria-valuemin={0} aria-valuemax={budget} aria-valuenow={Math.round(total)}>
            <span style={{ width: `${share * 100}%` }} />
          </div>
          <div className={`budget-left ${left < 0 ? 'is-over' : ''}`}>
            {left >= 0 ? `${kr(left)} tilbage` : `${kr(-left)} over budget`}
          </div>
        </>
      ) : null}
    </div>
  );
}

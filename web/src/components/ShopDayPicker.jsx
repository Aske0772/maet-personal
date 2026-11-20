import { DAY_NAMES, DAY_SHORT } from '../lib/dates.js';

// The weekday you shop. Weeks run from it to the next, and the coming week is
// priced for that day.
export function ShopDayPicker({ value, onChange }) {
  return (
    <section className="shopday" aria-label="Handledag">
      <div className="shopday-head">
        <span className="stepper-label">Handledag</span>
        <span className="muted small">Ugen går herfra til næste {DAY_NAMES[value].toLowerCase()}</span>
      </div>
      <div className="day-picker day-picker--light" role="radiogroup" aria-label="Handledag">
        {DAY_SHORT.map((name, i) => (
          <button
            key={name} type="button" role="radio" aria-checked={i === value} aria-label={DAY_NAMES[i]}
            className={i === value ? 'is-on' : ''} onClick={() => onChange(i)}
          >
            {name.slice(0, 2)}
          </button>
        ))}
      </div>
    </section>
  );
}

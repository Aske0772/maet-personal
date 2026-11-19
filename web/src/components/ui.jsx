import { useEffect, useState } from 'react';
import { Minus, Plus } from './icons.jsx';

export function Sheet({ open, onClose, children, label }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet" role="dialog" aria-modal="true" aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        {children}
      </div>
    </div>
  );
}

export function Stepper({ label, value, min = 1, max = 12, onChange, unit }) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button
          type="button" className="round" aria-label={`Færre ${label.toLowerCase()}`}
          disabled={value <= min} onClick={() => onChange(value - 1)}
        >
          <Minus size={18} />
        </button>
        <span className="stepper-value" aria-live="polite">
          {value}
          {unit && <small> {unit(value)}</small>}
        </span>
        <button
          type="button" className="round" aria-label={`Flere ${label.toLowerCase()}`}
          disabled={value >= max} onClick={() => onChange(value + 1)}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

// Photos come from the recipe's own site. Before one has loaded the card shows the
// photo's main colour, so there is never a white gap; one that fails becomes the plate.
const failed = new Set();
const loaded = new Set();

// Fetch and decode photos ahead of the swipe (the next cards in the deck).
export function preloadImages(urls) {
  for (const url of urls) {
    if (!url || loaded.has(url) || failed.has(url)) continue;
    loaded.add(url);
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.src = url;
    img.decode().catch(() => { loaded.delete(url); failed.add(url); });
  }
}

// Photo when we have one, otherwise a generated plate in the dish's own colour.
export function DishArt({ recipe, className = '' }) {
  const [broken, setBroken] = useState(() => failed.has(recipe.image));
  if (recipe.image && !broken) {
    return (
      <img
        className={`dish-art ${className}`} src={recipe.image} alt="" draggable="false"
        referrerPolicy="no-referrer" decoding="async"
        style={recipe.color ? { backgroundColor: recipe.color } : undefined}
        onError={() => { failed.add(recipe.image); setBroken(true); }}
      />
    );
  }
  const h = recipe.hue;
  return (
    <div
      className={`dish-art dish-art--gen ${className}`}
      style={{ '--h1': `${h}`, '--h2': `${(h + 28) % 360}` }}
      aria-hidden="true"
    >
      <span className="dish-emoji">{recipe.emoji}</span>
    </div>
  );
}

// Recipe library: dinner dishes from Danish food sites (Arla, Valdemarsro, Madens
// Verden, Mummum), built by scripts/build-recipes.mjs into data/recipes.json.
// Only facts come from the source – ingredients, amounts, time, servings, the photo
// URL and the link; the steps are written in our own words. Quantities are for
// `serves` people, in the ingredient's unit (see ingredients.js). `hero` lists the
// ingredients that make a dish worth suggesting: if one of them is on offer in a
// chosen store, the dish shows up.
import { readFileSync } from 'node:fs';

export const RECIPES = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8'));

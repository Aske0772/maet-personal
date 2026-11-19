// Word search shared by "Tilføj vare" and Hjemme.
export const norm = (s) => s.toLocaleLowerCase('da-DK');
export const wordsOf = (s) => norm(s).split(/[^a-zæøåäöü0-9]+/).filter(Boolean);

// How well a product name answers one search word, best first:
// 0 a whole word or the end of one ("letmælk" for mælk), or the end of the search
//   word itself ("druer" for vindruer); 1 the start of a word ("mælkesnitte");
// 2 anywhere in the name. null: no match.
export function wordScore(title, titleWords, w) {
  if (titleWords.some((t) => t === w || (t.endsWith(w) && w.length >= 3) || (t.length >= 4 && w.endsWith(t)))) return 0;
  if (titleWords.some((t) => t.startsWith(w))) return 1;
  return title.includes(w) ? 2 : null;
}

// Score of a whole name against all search words (lower is better), or null.
export function nameScore(name, words) {
  const title = norm(name);
  const tw = wordsOf(name);
  let score = 0;
  for (const w of words) {
    const s = wordScore(title, tw, w);
    if (s == null) return null;
    score += s;
  }
  return score;
}

/* Library data: the v2 runtime (dist/, via berea-data.js) and catalog helpers (book names, canon
   profiles, book lists). Book ids are native book codes (USFM, e.g. 'JHN'); `legacyId()` gives the
   pre-v2 app id ('john'), used only to migrate saved prefs and to keep live-text cache keys stable.
   The live NASB/ESV code is in live.js. */
import { createData } from './berea-data.js';

/* ---------- v2: dist/ ---------- */
export const lib = createData({ base: 'dist/' });
export let CAT = null;
export async function loadCatalog(){ CAT = await lib.catalog(); return CAT; }
export const bookName = code=> CAT.byCode[code].name;
export const bookGroup = code=> CAT.byCode[code].group;
// pre-v2 app ids ('john', 'addesth'): saved prefs and the live-text cache keys
export const legacyId = code=> (CAT.byCode[code] || {}).legacy;
export const codeFromLegacy = id=> (CAT.books.find(b=> b.legacy === id) || {}).code;
export const hasBook = (tr, code, profile)=>{
  const b = CAT.translations[tr] && CAT.translations[tr].books[code];
  return !!b && (!profile || b.nav.includes(profile));
};
// A verse's pivots that lie inside a canon profile (citations elsewhere aren't shown under it).
export const pivotsIn = (vids, profile)=>{
  const allowed = new Set(CAT.profiles[profile]);
  return vids.filter(v=> allowed.has(CAT.byOrd[Math.floor(v / 2 ** 20)].code));
};
// Where a native book falls in a canon profile's order (by the first of its pivot books there).
function profilePos(tr, code, profile){
  const order = CAT.profiles[profile];
  const ps = CAT.translations[tr].books[code].pivots.map(p=> order.indexOf(p)).filter(i=> i >= 0);
  return ps.length ? Math.min(...ps) : Infinity;
}
/* The book list for a pick: the translation's own books, plus the KJV's for any part of the Bible it
   doesn't have (YLT in the OT, the deuterocanonical books for ASV/NASB/ESV, Tobit for the DRA), each
   tagged with the translation actually shown there. */
export async function navEntries(pick, profile){
  const own = (await lib.navBooks(pick, profile)).map(b=> ({ ...b, tr: pick }));
  const covered = new Set(own.flatMap(b=> CAT.translations[pick].books[b.code].pivots));
  const fallback = pick === 'KJV' ? [] : (await lib.navBooks('KJV', profile))
    .filter(b=> !CAT.translations.KJV.books[b.code].pivots.some(p=> covered.has(p))).map(b=> ({ ...b, tr: 'KJV' }));
  const allowed = new Set(CAT.profiles[profile]);
  return [...own, ...fallback]
    .map(b=> ({ ...b, fathers: CAT.translations[b.tr].books[b.code].pivots.filter(p=> allowed.has(p))
                              .reduce((n, p)=> n + (CAT.commentary.fathers.verses[p] || 0), 0) }))
    .sort((a, b)=> profilePos(a.tr, a.code, profile) - profilePos(b.tr, b.code, profile));
}
export const translationName = code=> CAT.translations[code].name;
// Translations with text for (part of) a native book, in display order; live ones only where
// liveAvailable(code) says they're configured.
export function translationsFor(tr, code, liveAvailable = ()=> false){
  const want = new Set(CAT.translations[tr].books[code].pivots);
  return Object.keys(CAT.translations).filter(t=>{
    if(CAT.translations[t].live && !liveAvailable(t)) return false;
    return Object.values(CAT.translations[t].books).some(b=> b.pivots.some(p=> want.has(p)));
  });
}

/* Entry point: boot the library, show the saved chapter, set up the settings menu. (The saved theme is
   applied before first paint by an inline script in index.html.) */
import { state, el } from './app.js';
import { loadCatalog, CAT, lib, hasBook, codeFromLegacy } from './data.js';
import { purgeExpiredNasb, flushFumsQueue, LIVE_TRANSLATIONS } from './live.js';
import { renderNav, syncBookControls, showChapter, moveTo } from './reader.js';
import { initSettings } from './settings.js';

/* ---------- boot ---------- */
// Put the saved place into the shown translation's own structure. Prefs from before v2 hold old ids
// ('ps') and KJV-numbered chapters for every translation, so they are read as a KJV place and then
// located in the pick (a saved DRA 'ps' 23 opens DRA Psalm 22; 'sus' opens DRA Daniel 13). A book the
// pick doesn't have natively is handled the same way.
// The canon defaults to Protestant. Prefs from before v2 have none: if they were left on a
// deuterocanonical book, pick the canon that shows it, so returning readers keep their place.
function restoreCanon(){
  if(CAT.profiles[state.canon]) return;
  const code = CAT.byCode[state.bookId] ? state.bookId : codeFromLegacy(state.bookId);
  state.canon = !code || CAT.profiles.protestant.includes(code) ? 'protestant'
              : CAT.profiles.catholic.includes(code) ? 'catholic' : 'orthodox';
}
async function restorePlace(){
  restoreCanon();
  const legacy = !CAT.byCode[state.bookId];
  if(legacy) state.bookId = codeFromLegacy(state.bookId) || 'JHN';
  const pick = CAT.translations[state.translation] && !(LIVE_TRANSLATIONS[state.translation] && !LIVE_TRANSLATIONS[state.translation].available())
    ? state.translation : 'KJV';
  state.translation = pick;
  if(!CAT.translations[state.defaultTranslation] || (LIVE_TRANSLATIONS[state.defaultTranslation] && !LIVE_TRANSLATIONS[state.defaultTranslation].available())) state.defaultTranslation = 'KJV';
  state.shown = hasBook(pick, state.bookId, state.canon) && !legacy ? pick : hasBook('KJV', state.bookId, state.canon) ? 'KJV' : null;
  if(!state.shown){ state.bookId = 'JHN'; state.chapter = 1; state.shown = hasBook(pick, 'JHN') ? pick : 'KJV'; }
  const chs = CAT.translations[state.shown].live ? CAT.translations[state.shown].books[state.bookId].chapters
                                                 : await lib.chapters(state.shown, state.bookId, state.canon);
  if(!chs.includes(state.chapter)) state.chapter = chs[0];
  if(state.shown !== pick){
    state.rows = await lib.chapter(state.shown, state.bookId, state.chapter, state.canon);
    await moveTo(pick);
  }
}
async function boot(){
  try{
    await loadCatalog();
  }catch(e){
    el.readingInner.innerHTML = '<div class="loading">Could not load the library. Please reload.</div>';
    return;
  }
  purgeExpiredNasb(); // drop api.bible text cached more than 30 days ago (not awaited)
  flushFumsQueue();   // send FUMS reports queued while offline
  await restorePlace();
  await renderNav();
  await syncBookControls();
  initSettings();
  await showChapter();   // prefs aren't saved here: old ids are migrated again on each load
}
boot();

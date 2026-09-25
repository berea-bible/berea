/* Shared app core: viewer state, persisted prefs, DOM refs, small helpers. */

/* ---------- persisted per-viewer prefs ---------- */
function loadPrefs(){
  try{
    const raw = localStorage.getItem('verbum-prefs');
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
// The top bar's translation menu is a switch for this visit (kept across reloads of the tab), while
// the saved `translation` is the default translation from Settings.
function loadSession(){
  try{ return JSON.parse(sessionStorage.getItem('verbum-session') || '{}') || {}; }catch(e){ return {}; }
}
export function savePrefs(){
  try{
    localStorage.setItem('verbum-prefs', JSON.stringify({
      bookId: state.bookId, chapter: state.chapter, translation: state.defaultTranslation, canon: state.canon,
      showGreek: state.showGreek, theme: document.documentElement.getAttribute('data-theme') || ''
    }));
  }catch(e){}
  try{ sessionStorage.setItem('verbum-session', JSON.stringify({ translation: state.translation })); }catch(e){}
}
export const prefs = loadPrefs();
const session = loadSession();

/* ---------- state ----------
   defaultTranslation: the Settings default (saved); Berea opens in it. translation: the viewer's pick
   for this visit (the top-bar menu), starting at the default. shown: the translation actually on screen, which is the pick, or
   the KJV where the pick has no text (YLT in the OT). bookId/chapter are in the shown translation's
   own book structure and numbering (a native book code, e.g. 'DAN'; saved prefs from before v2 hold
   the old ids, e.g. 'dan', and are migrated at boot). canon: the canon profile ('protestant',
   'catholic', 'orthodox') that the book list, reader, Compare and Fathers show; see main.js for its default. */
export const state = { bookId: prefs.bookId || 'JHN', chapter: prefs.chapter || 1,
  defaultTranslation: prefs.translation || 'KJV', translation: session.translation || prefs.translation || 'KJV',
  shown: session.translation || prefs.translation || 'KJV', canon: prefs.canon || null, rows: [], selectedVerse: null, showGreek: !!prefs.showGreek };

/* ---------- elements ---------- */
export const el = {
  bookBtn: document.getElementById('bookBtn'),
  bookLabel: document.getElementById('bookLabel'),
  bookPicker: document.getElementById('bookPicker'),
  bookList: document.getElementById('bookList'),
  canonSwitch: document.getElementById('canonSwitch'),
  navFoot: document.getElementById('navFoot'),
  chapterBtn: document.getElementById('chapterBtn'),
  chapterLabel: document.getElementById('chapterLabel'),
  chapterPicker: document.getElementById('chapterPicker'),
  chapterPickerTitle: document.getElementById('chapterPickerTitle'),
  chapterList: document.getElementById('chapterList'),
  pickerBackdrop: document.getElementById('pickerBackdrop'),
  translationSelect: document.getElementById('translationSelect'),
  prevCh: document.getElementById('prevCh'),
  nextCh: document.getElementById('nextCh'),
  reading: document.getElementById('reading'),
  readingInner: document.getElementById('readingInner'),
  interlinearToggle: document.getElementById('interlinearToggle'),
  interlinearCheck: document.getElementById('interlinearCheck'),
  greekTab: document.getElementById('greekTab'),
  overlay: document.getElementById('overlay'),
  panel: document.getElementById('panel'),
  panelRef: document.getElementById('panelRef'),
  panelClose: document.getElementById('panelClose'),
  fathersBadge: document.getElementById('fathersBadge'),
  paneCompare: document.getElementById('pane-compare'),
  paneGreek: document.getElementById('pane-greek'),
  paneFathers: document.getElementById('pane-fathers'),
  lexPop: document.getElementById('lexPop'),
  lexBackdrop: document.getElementById('lexBackdrop'),
  menuBtn: document.getElementById('menuBtn'),
  settingsMenu: document.getElementById('settingsMenu'),
  defaultTranslation: document.getElementById('defaultTranslation'),
  themeSwitch: document.getElementById('themeSwitch'),
  canonHint: document.getElementById('canonHint'),
};

export function escapeHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

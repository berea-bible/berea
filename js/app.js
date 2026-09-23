/* Shared app core: viewer state, persisted prefs, DOM refs, small helpers. */

/* ---------- persisted per-viewer prefs ---------- */
function loadPrefs(){
  try{
    const raw = localStorage.getItem('verbum-prefs');
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
export function savePrefs(){
  try{
    localStorage.setItem('verbum-prefs', JSON.stringify({
      bookId: state.bookId, chapter: state.chapter, translation: state.translation,
      showGreek: state.showGreek, theme: document.documentElement.getAttribute('data-theme') || ''
    }));
  }catch(e){}
}
export const prefs = loadPrefs();

/* ---------- state ---------- */
export const state = { bookId: prefs.bookId || 'john', chapter: prefs.chapter || 1, translation: prefs.translation || 'KJV', selectedVerse: null, showGreek: !!prefs.showGreek };

/* ---------- elements ---------- */
export const el = {
  bookBtn: document.getElementById('bookBtn'),
  bookLabel: document.getElementById('bookLabel'),
  bookPicker: document.getElementById('bookPicker'),
  bookList: document.getElementById('bookList'),
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
  interlinearCheck: document.getElementById('interlinearCheck'),
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
  themeBtn: document.getElementById('themeBtn'),
};

export function escapeHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

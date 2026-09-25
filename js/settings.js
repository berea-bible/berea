/* Settings menu (☰ in the top bar): default translation, appearance, tradition. Everything is saved in
   this browser (localStorage `verbum-prefs`, via savePrefs). The menu itself opens and closes with the
   top-bar pickers in reader.js. */
import { state, el, savePrefs } from './app.js';
import { CAT, translationName } from './data.js';
import { liveAvailable } from './live.js';
import { setCanon, switchTranslation } from './reader.js';

const CANON_HINT = {
  protestant: 'The 66 books of the Old and New Testaments.',
  catholic: 'Adds Tobit, Judith, Wisdom, Sirach, Baruch, 1–2 Maccabees and the additions to Esther and Daniel.',
  orthodox: 'The Catholic books plus 1–2 Esdras, the Prayer of Manasseh and the Greek Esther.',
};
const YEAR_SUFFIX = /\s*\(\d{4}[^)]*\)$/;

/* ---------- default translation ---------- */
function renderTranslations(){
  el.defaultTranslation.innerHTML = '';
  Object.keys(CAT.translations).filter(t=> !CAT.translations[t].live || liveAvailable(t)).forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t + ' — ' + translationName(t).replace(YEAR_SUFFIX, '');
    el.defaultTranslation.appendChild(opt);
  });
  el.defaultTranslation.value = state.defaultTranslation;
}
el.defaultTranslation.addEventListener('change', async ()=>{
  state.defaultTranslation = el.defaultTranslation.value;
  savePrefs();
  await switchTranslation(state.defaultTranslation);   // and read in it now
});

/* ---------- appearance: follow the system, or force light / dark ---------- */
function markTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || '';
  el.themeSwitch.querySelectorAll('button').forEach(b=> b.setAttribute('aria-pressed', String(b.dataset.themeChoice === cur)));
}
el.themeSwitch.querySelectorAll('button').forEach(btn=> btn.addEventListener('click', ()=>{
  if(btn.dataset.themeChoice) document.documentElement.setAttribute('data-theme', btn.dataset.themeChoice);
  else document.documentElement.removeAttribute('data-theme');
  markTheme(); savePrefs();
}));

/* ---------- tradition (the canon profile) ---------- */
function markCanon(canon = state.canon){
  el.canonSwitch.querySelectorAll('button').forEach(b=> b.setAttribute('aria-pressed', String(b.dataset.canon === canon)));
  el.canonHint.textContent = CANON_HINT[canon] || '';
}
el.canonSwitch.querySelectorAll('button').forEach(btn=> btn.addEventListener('click', async ()=>{
  if(btn.dataset.canon === state.canon) return;
  markCanon(btn.dataset.canon);                // at once; the book list and chapter follow
  await setCanon(btn.dataset.canon);
  markCanon();
}));

// Called once the catalog has loaded (main.js).
export function initSettings(){
  renderTranslations();
  markTheme();
  markCanon();
}

/* Entry point: theme, then boot the library and show the saved chapter. */
import { state, el, savePrefs } from './app.js';
import { loadIndex, loadBook, bookMeta } from './data.js';
import { renderNav, populateChapterSelect, showChapter } from './reader.js';

/* ---------- theme ---------- */
el.themeBtn.addEventListener('click', ()=>{
  const cur = document.documentElement.getAttribute('data-theme');
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : (sysDark ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', next);
  savePrefs();
});

/* ---------- boot ---------- */
async function boot(){
  try{
    await loadIndex();
  }catch(e){
    el.readingInner.innerHTML = '<div class="loading">Could not load the library. Please reload.</div>';
    return;
  }
  if(!bookMeta(state.bookId)) state.bookId = 'john';
  renderNav();
  await loadBook(state.bookId);
  const meta = bookMeta(state.bookId);
  if(state.chapter > meta.chapters) state.chapter = 1;
  populateChapterSelect();
  await showChapter();
}
boot();

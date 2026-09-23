/* Reader: book nav rail, top-bar controls, and the chapter reading pane. */
import { state, el, savePrefs, escapeHtml } from './app.js';
import { INDEX, bookCache, bookMeta, loadBook, nasbAvailable, ensureNasbChapter } from './data.js';
import { openVerse, closePanel } from './panel.js';
import { showLexicon } from './greek.js';

/* ---------- nav ---------- */
export function renderNav(){
  el.bookList.innerHTML = '';
  INDEX.books.forEach(b=>{
    const btn = document.createElement('button');
    btn.className = 'book-btn' + (b.id === state.bookId ? ' active' : '');
    btn.dataset.id = b.id;
    btn.innerHTML = '<span>'+b.name+'</span>' + (b.fatherVerseCount ? '<span class="fcount">'+b.fatherVerseCount+'</span>' : '');
    btn.addEventListener('click', ()=> selectBook(b.id, 1));
    el.bookList.appendChild(btn);
  });
  el.navFoot.textContent = INDEX.fatherAuthorCount + ' early church authors · ' + INDEX.fatherQuoteCount.toLocaleString() + ' citations, c. 100–800 AD';
  renderTranslationSelect();
}
function renderTranslationSelect(){
  const prev = el.translationSelect.value;
  el.translationSelect.innerHTML = '';
  Object.keys(INDEX.translations).forEach(code=>{
    const opt = document.createElement('option');
    opt.value = code; opt.textContent = code + ' — ' + INDEX.translations[code];
    el.translationSelect.appendChild(opt);
  });
  if(nasbAvailable()){
    const nasbOpt = document.createElement('option');
    nasbOpt.value = 'NASB';
    nasbOpt.textContent = 'NASB — New American Standard (1995, live)';
    el.translationSelect.appendChild(nasbOpt);
  }
  el.translationSelect.value = (prev && [...el.translationSelect.options].some(o=>o.value===prev)) ? prev : state.translation;
}
function markActiveBook(){
  [...el.bookList.children].forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.id === state.bookId);
  });
}

export function populateChapterSelect(){
  const meta = bookMeta(state.bookId);
  el.chapterSelect.innerHTML = '';
  for(let c=1; c<=meta.chapters; c++){
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = 'Chapter ' + c;
    if(c === state.chapter) opt.selected = true;
    el.chapterSelect.appendChild(opt);
  }
  el.prevCh.disabled = state.chapter <= 1;
  el.nextCh.disabled = state.chapter >= meta.chapters;
}

/* ---------- reading pane ---------- */
async function selectBook(id, chapter){
  state.bookId = id; state.chapter = chapter || 1; state.selectedVerse = null;
  closeNavMobile(); closePanel();
  markActiveBook();
  el.readingInner.innerHTML = '<div class="loading">Loading '+bookMeta(id).name+'&hellip;</div>';
  await loadBook(id);
  populateChapterSelect();
  await showChapter();
  savePrefs();
}
async function selectChapter(c){
  state.chapter = c; state.selectedVerse = null;
  closePanel();
  await loadBook(state.bookId);
  populateChapterSelect();
  await showChapter();
  savePrefs();
}
export async function showChapter(){
  if(state.translation === 'NASB' && !nasbAvailable()){
    state.translation = 'KJV';
    el.translationSelect.value = 'KJV';
  }
  if(state.translation === 'NASB'){
    el.chapterTitle.innerHTML = bookMeta(state.bookId).name + ' <span class="num">' + state.chapter + '</span>';
    el.readingInner.innerHTML = '<div class="loading">Fetching NASB&hellip;</div>';
    try{
      await ensureNasbChapter(state.bookId, state.chapter);
    }catch(e){
      el.readingInner.innerHTML =
        '<div class="loading" style="max-width:440px;margin:60px auto 0;line-height:1.6">'+
        'Couldn\'t load the NASB (' + escapeHtml(e.message||'') + ').<br><br>'+
        '<button id="nasbRetryLink" class="text-btn" style="display:inline;background:none;border:none;color:var(--accent);font-weight:600;cursor:pointer;font-size:inherit">Try again</button>'+
        ' or <button id="nasbFallbackLink" class="text-btn" style="display:inline;background:none;border:none;color:var(--accent);font-weight:600;cursor:pointer;font-size:inherit">switch to KJV</button>.'+
        '</div>';
      const retry = document.getElementById('nasbRetryLink');
      if(retry) retry.addEventListener('click', ()=> showChapter());
      const fallback = document.getElementById('nasbFallbackLink');
      if(fallback) fallback.addEventListener('click', ()=>{
        state.translation = 'KJV'; el.translationSelect.value = 'KJV'; showChapter(); savePrefs();
      });
      return;
    }
  }
  renderChapter();
}
function renderChapter(){
  const book = bookCache[state.bookId];
  const meta = bookMeta(state.bookId);
  const ch = String(state.chapter);
  const verses = (book.translations[state.translation] || {})[ch] || {};
  const verseNums = Object.keys(verses).map(Number).sort((a,b)=>a-b);
  const greekCh = book.greek[ch] || {};
  const fathersCh = book.fathers[ch] || {};

  el.chapterTitle.innerHTML = meta.name + ' <span class="num">' + state.chapter + '</span>';

  let html = '<h2 class="chapter-heading">'+meta.name+' '+state.chapter+'</h2>';
  html += '<p class="chapter-sub">'+state.translation+' &middot; tap a verse number to compare translations, read the Greek, or see commentaries from the early church</p>';

  verseNums.forEach(vn=>{
    const vs = String(vn);
    const text = verses[vs];
    const hasFathers = fathersCh[vs] && fathersCh[vs].length;
    html += '<div class="verse" data-v="'+vs+'">';
    html += '<button class="vnum" data-v="'+vs+'">'+vs+'</button>';
    html += '<div class="vbody">';
    html += '<div class="vtext" data-v="'+vs+'">'+escapeHtml(text)+(hasFathers?'<span class="fmark" title="Church father citations available"></span>':'')+'</div>';
    if(state.showGreek && greekCh[vs]){
      html += '<div class="vgreek">' + greekCh[vs].map(w=>
        '<button class="gword" data-s="'+ (w.s[0]||'') +'">'+
          '<span class="gk">'+escapeHtml(w.g)+'</span>'+
          '<span class="gl">'+escapeHtml(w.gl)+'</span>'+
        '</button>'
      ).join('') + '</div>';
    }
    html += '</div></div>';
  });

  el.readingInner.innerHTML = html;

  el.readingInner.querySelectorAll('.vnum, .vtext').forEach(node=>{
    node.addEventListener('click', ()=> openVerse(parseInt(node.dataset.v,10)));
  });
  el.readingInner.querySelectorAll('.gword').forEach(node=>{
    node.addEventListener('click', (e)=>{ e.stopPropagation(); showLexicon(node.dataset.s, node); });
  });
  el.reading.scrollTop = 0;
}

/* ---------- top bar controls ---------- */
el.interlinearCheck.checked = state.showGreek;
el.translationSelect.addEventListener('change', async ()=>{
  state.translation = el.translationSelect.value;
  await showChapter();
  if(state.selectedVerse) openVerse(state.selectedVerse);
  savePrefs();
});
el.chapterSelect.addEventListener('change', ()=> selectChapter(parseInt(el.chapterSelect.value,10)));
el.prevCh.addEventListener('click', ()=>{ if(state.chapter>1) selectChapter(state.chapter-1); });
el.nextCh.addEventListener('click', ()=>{ const m=bookMeta(state.bookId); if(state.chapter<m.chapters) selectChapter(state.chapter+1); });
el.interlinearCheck.addEventListener('change', ()=>{ state.showGreek = el.interlinearCheck.checked; renderChapter(); savePrefs(); });
el.navToggle.addEventListener('click', ()=> el.nav.classList.toggle('show'));
function closeNavMobile(){ el.nav.classList.remove('show'); }

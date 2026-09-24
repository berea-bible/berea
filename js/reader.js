/* Reader: top-bar navigation (book/chapter pickers), controls, and the chapter reading pane. */
import { state, el, savePrefs, escapeHtml } from './app.js';
import { INDEX, bookCache, bookMeta, isOT, loadBook, nasbAvailable, ensureNasbChapter, translationAvailable, effectiveTranslation, NASB_NOTICE_HTML, reportNasbView } from './data.js';
import { openVerse, closePanel } from './panel.js';
import { showLexicon, displayWord, langLabels } from './greek.js';

/* ---------- book / chapter pickers ---------- */
const pickers = [[el.bookBtn, el.bookPicker], [el.chapterBtn, el.chapterPicker]];
function openPicker(btn, picker){
  closePickers();
  picker.classList.add('show'); btn.setAttribute('aria-expanded', 'true');
  el.pickerBackdrop.classList.add('show');
  const active = picker.querySelector('.active');
  if(active){ active.scrollIntoView({block:'nearest'}); active.focus({preventScroll:true}); }
}
function closePickers(){
  pickers.forEach(([btn, picker])=>{ picker.classList.remove('show'); btn.setAttribute('aria-expanded', 'false'); });
  el.pickerBackdrop.classList.remove('show');
}
pickers.forEach(([btn, picker])=>{
  btn.addEventListener('click', ()=> picker.classList.contains('show') ? closePickers() : openPicker(btn, picker));
  picker.querySelector('.picker-close').addEventListener('click', closePickers);
});
el.pickerBackdrop.addEventListener('click', closePickers); // swallows the dismiss click so it doesn't hit the page
document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closePickers(); });

export function renderNav(){
  el.bookList.innerHTML = '';
  INDEX.books.forEach((b, i)=>{
    if(i === 0 || isOT(b.id) !== isOT(INDEX.books[i-1].id)){
      const head = document.createElement('div');
      head.className = 'book-section';
      head.textContent = isOT(b.id) ? 'Old Testament' : 'New Testament';
      el.bookList.appendChild(head);
    }
    const btn = document.createElement('button');
    btn.className = 'book-btn' + (b.id === state.bookId ? ' active' : '');
    btn.dataset.id = b.id;
    btn.innerHTML = '<span>'+b.name+'</span>' + (b.fatherVerseCount ? '<span class="fcount">'+b.fatherVerseCount+'</span>' : '');
    btn.addEventListener('click', ()=>{ closePickers(); selectBook(b.id, 1); });
    el.bookList.appendChild(btn);
  });
  el.navFoot.textContent = INDEX.fatherAuthorCount + ' early church authors · ' + INDEX.fatherQuoteCount.toLocaleString() + ' citations, c. 100–800 AD';
}
// Options depend on the book (e.g. YLT has no OT text), so this re-runs on every book change.
function renderTranslationSelect(){
  el.translationSelect.innerHTML = '';
  Object.keys(INDEX.translations).filter(code=> translationAvailable(code, state.bookId)).forEach(code=>{
    const opt = document.createElement('option');
    opt.value = code; opt.dataset.name = INDEX.translations[code];
    el.translationSelect.appendChild(opt);
  });
  if(nasbAvailable()){
    const nasbOpt = document.createElement('option');
    nasbOpt.value = 'NASB'; nasbOpt.dataset.name = 'New American Standard (1995, live)';
    el.translationSelect.appendChild(nasbOpt);
  }
  labelTranslationOptions();
  el.translationSelect.value = effectiveTranslation(state.translation, state.bookId);
}
// phones show just the acronym ("KJV"); wider screens show "KJV — King James Version ..."
const compactMQ = window.matchMedia('(max-width:640px)');
function labelTranslationOptions(){
  [...el.translationSelect.options].forEach(opt=>{
    opt.textContent = compactMQ.matches ? opt.value : opt.value + ' — ' + opt.dataset.name;
  });
}
compactMQ.addEventListener('change', labelTranslationOptions);
function markActiveBook(){
  [...el.bookList.children].forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.id === state.bookId);
  });
}

// "Greek"/"Hebrew" on the interlinear toggle (Ω/א on phones) and the panel tab.
function setLanguageLabels(){
  const hebrew = isOT(state.bookId), lang = langLabels(hebrew);
  el.interlinearToggle.title = 'Show ' + lang.name + ' line';
  el.interlinearToggle.querySelector('.full').textContent = lang.name;
  const short = el.interlinearToggle.querySelector('.short');
  short.textContent = lang.symbol;
  short.className = 'short ' + (hebrew ? 'hebrew' : 'greek');
  el.greekTab.textContent = lang.name;
}
// Everything in the top bar / panel that depends on which book is open.
export function syncBookControls(){
  markActiveBook();
  populateChapterPicker();
  renderTranslationSelect();
  setLanguageLabels();
}

function populateChapterPicker(){
  const meta = bookMeta(state.bookId);
  el.bookLabel.textContent = meta.name;
  el.chapterLabel.textContent = state.chapter;
  el.chapterPickerTitle.textContent = meta.name;
  el.chapterList.innerHTML = '';
  for(let c=1; c<=meta.chapters; c++){
    const btn = document.createElement('button');
    btn.className = 'ch-btn' + (c === state.chapter ? ' active' : '');
    btn.textContent = c;
    btn.addEventListener('click', ()=>{ closePickers(); selectChapter(c); });
    el.chapterList.appendChild(btn);
  }
  el.prevCh.disabled = state.chapter <= 1;
  el.nextCh.disabled = state.chapter >= meta.chapters;
}

/* ---------- reading pane ---------- */
async function selectBook(id, chapter){
  state.bookId = id; state.chapter = chapter || 1; state.selectedVerse = null;
  closePanel();
  syncBookControls();
  el.readingInner.innerHTML = '<div class="loading">Loading '+bookMeta(id).name+'&hellip;</div>';
  await loadBook(id);
  await showChapter();
  savePrefs();
}
async function selectChapter(c){
  state.chapter = c; state.selectedVerse = null;
  closePanel();
  populateChapterPicker();
  await loadBook(state.bookId);
  await showChapter();
  savePrefs();
}
export async function showChapter(){
  if(state.translation === 'NASB' && !nasbAvailable()){
    state.translation = 'KJV';
    el.translationSelect.value = 'KJV';
  }
  if(state.translation === 'NASB'){
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
  // FUMS: one view per chapter shown in NASB (not on Greek-line re-renders)
  if(state.translation === 'NASB') reportNasbView(state.bookId, state.chapter);
}
function renderChapter(){
  const book = bookCache[state.bookId];
  const meta = bookMeta(state.bookId);
  const ch = String(state.chapter);
  const hebrew = isOT(state.bookId);
  const translation = effectiveTranslation(state.translation, state.bookId);
  const verses = (book.translations[translation] || {})[ch] || {};
  const verseNums = Object.keys(verses).map(Number).sort((a,b)=>a-b);
  const greekCh = book.greek[ch] || {};
  const fathersCh = book.fathers[ch] || {};

  let html = '<h2 class="chapter-heading">'+meta.name+' '+state.chapter+'</h2>';
  html += '<p class="chapter-sub">'+translation+' &middot; tap a verse number to compare translations, read the '+langLabels(hebrew).name+', or see commentaries from the early church</p>';

  verseNums.forEach(vn=>{
    const vs = String(vn);
    const text = verses[vs];
    const hasFathers = fathersCh[vs] && fathersCh[vs].length;
    html += '<div class="verse" data-v="'+vs+'">';
    html += '<button class="vnum" data-v="'+vs+'">'+vs+'</button>';
    html += '<div class="vbody">';
    html += '<div class="vtext" data-v="'+vs+'">'+escapeHtml(text)+(hasFathers?'<span class="fmark" title="Church father citations available"></span>':'')+'</div>';
    if(state.showGreek && greekCh[vs]){
      html += (hebrew ? '<div class="vgreek hebrew" dir="rtl">' : '<div class="vgreek">') + greekCh[vs].map(w=>
        '<button class="gword" data-s="'+ (w.s[0]||'') +'">'+
          '<span class="gk">'+escapeHtml(displayWord(w, hebrew))+'</span>'+
          '<span class="gl">'+escapeHtml(w.gl)+'</span>'+
        '</button>'
      ).join('') + '</div>';
    }
    html += '</div></div>';
  });

  if(translation === 'NASB') html += '<p class="nasb-notice chapter-notice">' + NASB_NOTICE_HTML + '</p>';
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
el.prevCh.addEventListener('click', ()=>{ if(state.chapter>1) selectChapter(state.chapter-1); });
el.nextCh.addEventListener('click', ()=>{ const m=bookMeta(state.bookId); if(state.chapter<m.chapters) selectChapter(state.chapter+1); });
el.interlinearCheck.addEventListener('change', ()=>{ state.showGreek = el.interlinearCheck.checked; renderChapter(); savePrefs(); });

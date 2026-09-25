/* Reader: top-bar navigation (book/chapter pickers), controls, and the chapter reading pane. */
import { state, el, savePrefs, escapeHtml } from './app.js';
import { INDEX, bookCache, bookMeta, chapterNumbers, loadOriginal, isOT, isDeuterocanonical, loadBook, translationAvailable, effectiveTranslation, translationCodes, translationName, LIVE_TRANSLATIONS } from './data.js';
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
  // Old Testament, then the deuterocanonical books (kept separate, as in the 1611 KJV), then the New Testament
  const section = id=> isOT(id) ? 'Old Testament' : isDeuterocanonical(id) ? 'Deuterocanonical' : 'New Testament';
  INDEX.books.forEach((b, i)=>{
    if(i === 0 || section(b.id) !== section(INDEX.books[i-1].id)){
      const head = document.createElement('div');
      head.className = 'book-section';
      head.textContent = section(b.id);
      el.bookList.appendChild(head);
    }
    const btn = document.createElement('button');
    btn.className = 'book-btn' + (b.id === state.bookId ? ' active' : '');
    btn.dataset.id = b.id;
    btn.innerHTML = '<span>'+b.name+'</span>' + (b.fatherVerseCount ? '<span class="fcount">'+b.fatherVerseCount+'</span>' : '');
    btn.addEventListener('click', ()=>{ closePickers(); selectBook(b.id); });
    el.bookList.appendChild(btn);
  });
  el.navFoot.textContent = INDEX.fatherAuthorCount + ' early church authors · ' + INDEX.fatherQuoteCount.toLocaleString() + ' citations, c. 100–800 AD';
}
// Options depend on the book (e.g. YLT has no OT text), so this re-runs on every book change.
// Dropdown names drop a trailing year, e.g. "(1611/1769)" or "(1995)", unless two listed
// options share a name (multiple editions of one translation), where the year tells them apart.
const YEAR_SUFFIX = /\s*\(\d{4}[^)]*\)$/;
function renderTranslationSelect(){
  el.translationSelect.innerHTML = '';
  const codes = translationCodes(state.bookId);
  const base = code=> translationName(code).replace(YEAR_SUFFIX, '');
  codes.forEach(code=>{
    const opt = document.createElement('option');
    const editions = codes.filter(c=> base(c) === base(code)).length;
    opt.value = code; opt.dataset.name = editions > 1 ? translationName(code) : base(code);
    el.translationSelect.appendChild(opt);
  });
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
  const chapters = chapterNumbers(state.bookId);
  for(const c of chapters){
    const btn = document.createElement('button');
    btn.className = 'ch-btn' + (c === state.chapter ? ' active' : '');
    btn.textContent = c;
    btn.addEventListener('click', ()=>{ closePickers(); selectChapter(c); });
    el.chapterList.appendChild(btn);
  }
  el.prevCh.disabled = state.chapter <= chapters[0];
  el.nextCh.disabled = state.chapter >= chapters[chapters.length - 1];
}

/* ---------- reading pane ---------- */
async function selectBook(id, chapter){
  state.bookId = id; state.chapter = chapter || chapterNumbers(id)[0]; state.selectedVerse = null;
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
  if(LIVE_TRANSLATIONS[state.translation] && !LIVE_TRANSLATIONS[state.translation].available()){
    state.translation = 'KJV';
    el.translationSelect.value = 'KJV';
  }
  // the translation actually shown for this book (e.g. NASB/ESV have no deuterocanonical books -> KJV)
  const code = effectiveTranslation(state.translation, state.bookId);
  const live = LIVE_TRANSLATIONS[code];   // NASB / ESV: fetched through the Worker
  if(live && live.available()){
    el.readingInner.innerHTML = '<div class="loading">Fetching ' + code + '&hellip;</div>';
    try{
      await live.ensure(state.bookId, state.chapter);
    }catch(e){
      el.readingInner.innerHTML =
        '<div class="loading" style="max-width:440px;margin:60px auto 0;line-height:1.6">'+
        'Couldn\'t load the ' + code + ' (' + escapeHtml(e.message||'') + ').<br><br>'+
        '<button id="liveRetryLink" class="text-btn" style="display:inline;background:none;border:none;color:var(--accent);font-weight:600;cursor:pointer;font-size:inherit">Try again</button>'+
        ' or <button id="liveFallbackLink" class="text-btn" style="display:inline;background:none;border:none;color:var(--accent);font-weight:600;cursor:pointer;font-size:inherit">switch to KJV</button>.'+
        '</div>';
      const retry = document.getElementById('liveRetryLink');
      if(retry) retry.addEventListener('click', ()=> showChapter());
      const fallback = document.getElementById('liveFallbackLink');
      if(fallback) fallback.addEventListener('click', ()=>{
        state.translation = 'KJV'; el.translationSelect.value = 'KJV'; showChapter(); savePrefs();
      });
      return;
    }
  }
  if(state.showGreek) await ensureOriginal();
  renderChapter();
  // FUMS (NASB only): one view per chapter shown (not on Greek-line re-renders)
  if(live && live.report) live.report(state.bookId, state.chapter);
}
// Attach the book's original-language words (own file) before rendering the Greek/Hebrew line.
// A failed load just renders without the line; turning the line off and on retries.
async function ensureOriginal(){
  const book = bookCache[state.bookId];
  if(!book || book.greek) return;
  try{ book.greek = await loadOriginal(state.bookId); }catch(e){ /* line stays empty */ }
}
function renderChapter(){
  const book = bookCache[state.bookId];
  const meta = bookMeta(state.bookId);
  const ch = String(state.chapter);
  const hebrew = isOT(state.bookId);
  const translation = effectiveTranslation(state.translation, state.bookId);
  const verses = (book.translations[translation] || {})[ch] || {};
  const verseNums = Object.keys(verses).map(Number).sort((a,b)=>a-b);
  const greekCh = (book.greek || {})[ch] || {};
  const fathersCh = book.fathers[ch] || {};

  let html = '<h2 class="chapter-heading">'+meta.name+' '+state.chapter+'</h2>';
  html += '<p class="chapter-sub">'+translation+' &middot; tap a verse number to compare translations, read the '+langLabels(hebrew).name+', or see commentaries from the early church</p>';
  // ESV terms: the notice and esv.org link sit with the translation name, on every ESV page
  if(translation === 'ESV') html += '<p class="live-notice chapter-sub-notice">' + LIVE_TRANSLATIONS.ESV.notice + '</p>';

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

  if(translation === 'NASB') html += '<p class="live-notice chapter-notice">' + LIVE_TRANSLATIONS.NASB.notice + '</p>';
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
function stepChapter(d){
  const chapters = chapterNumbers(state.bookId), i = chapters.indexOf(state.chapter) + d;
  if(i >= 0 && i < chapters.length) selectChapter(chapters[i]);
}
el.prevCh.addEventListener('click', ()=> stepChapter(-1));
el.nextCh.addEventListener('click', ()=> stepChapter(1));
el.interlinearCheck.addEventListener('change', async ()=>{
  state.showGreek = el.interlinearCheck.checked;
  if(state.showGreek) await ensureOriginal();
  renderChapter(); savePrefs();
});

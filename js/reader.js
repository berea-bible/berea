/* Reader: top-bar navigation (book/chapter pickers), controls, and the chapter reading pane. */
import { state, el, savePrefs, escapeHtml } from './app.js';
import { CAT, lib, navEntries, bookName, bookGroup, hasBook, translationsFor, translationName, pivotsIn } from './data.js';
import { LIVE_TRANSLATIONS, liveAvailable } from './live.js';
import { openVerse, closePanel } from './panel.js';
import { showLexicon, displayWord, langLabels, ORIGINAL_LANG, legacyWord } from './greek.js';

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

// The book list follows the pick's own book structure (the DRA's Daniel has chapters 13-14; the KJV
// has Susanna), with the KJV's books wherever the pick has no text.
const SECTION = { ot: 'Old Testament', dc: 'Deuterocanonical', nt: 'New Testament' };
export async function renderNav(){
  const entries = await navEntries(state.translation, state.canon);
  el.bookList.innerHTML = '';
  entries.forEach((b, i)=>{
    if(i === 0 || bookGroup(b.code) !== bookGroup(entries[i-1].code)){
      const head = document.createElement('div');
      head.className = 'book-section';
      head.textContent = SECTION[bookGroup(b.code)];
      el.bookList.appendChild(head);
    }
    const btn = document.createElement('button');
    btn.className = 'book-btn';
    btn.dataset.id = b.code; btn.dataset.tr = b.tr;
    btn.innerHTML = '<span>'+b.name+'</span>' + (b.fathers ? '<span class="fcount">'+b.fathers+'</span>' : '');
    btn.addEventListener('click', ()=>{ closePickers(); selectBook(b.code, b.tr); });
    el.bookList.appendChild(btn);
  });
  markCanon();
  const f = CAT.commentary.fathers;
  el.navFoot.textContent = f.authors + ' early church authors · ' + f.quotes.toLocaleString() + ' citations, c. 100–800 AD';
  markActiveBook();
}
/* ---------- canon profile ---------- */
function markCanon(){
  el.canonSwitch.querySelectorAll('button').forEach(b=> b.setAttribute('aria-pressed', String(b.dataset.canon === state.canon)));
}
el.canonSwitch.querySelectorAll('button').forEach(btn=> btn.addEventListener('click', ()=> setCanon(btn.dataset.canon)));
// Switch the book list, reader, Compare and Fathers to another canon. The picker stays open so the list
// visibly changes; if the open book or chapter isn't in the new canon, the reader moves to the nearest
// chapter that is (DRA Daniel 13 -> 12), or to the first book of the list.
async function setCanon(canon){
  if(canon === state.canon) return;
  state.canon = canon;
  markCanon();
  await renderNav();
  if(!(await navHasCurrent())){
    const entries = await navEntries(state.translation, canon);
    const first = entries[0];
    closePanel();
    await selectBook(first.code, first.tr);
  } else {
    const chs = CAT.translations[state.shown].live ? CAT.translations[state.shown].books[state.bookId].chapters
                                                   : await lib.chapters(state.shown, state.bookId, canon);
    if(!chs.includes(state.chapter)) state.chapter = [...chs].reverse().find(c=> c < state.chapter) || chs[0];
    closePanel();
    await syncBookControls();
    await showChapter();
  }
  savePrefs();
}
async function navHasCurrent(){
  return (await navEntries(state.translation, state.canon)).some(b=> b.code === state.bookId && b.tr === state.shown);
}

// Options depend on the book (e.g. YLT has no OT text), so this re-runs on every book change.
// Dropdown names drop a trailing year, e.g. "(1611/1769)" or "(1995)", unless two listed
// options share a name (multiple editions of one translation), where the year tells them apart.
const YEAR_SUFFIX = /\s*\(\d{4}[^)]*\)$/;
function renderTranslationSelect(){
  el.translationSelect.innerHTML = '';
  const codes = translationsFor(state.shown, state.bookId, liveAvailable);
  const base = code=> translationName(code).replace(YEAR_SUFFIX, '');
  codes.forEach(code=>{
    const opt = document.createElement('option');
    const editions = codes.filter(c=> base(c) === base(code)).length;
    opt.value = code; opt.dataset.name = editions > 1 ? translationName(code) : base(code);
    el.translationSelect.appendChild(opt);
  });
  labelTranslationOptions();
  el.translationSelect.value = state.shown;
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
  [...el.bookList.querySelectorAll('.book-btn')].forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.id === state.bookId && btn.dataset.tr === state.shown);
  });
}

// "Greek"/"Hebrew" on the interlinear toggle (Ω/א on phones) and the panel tab.
function setLanguageLabels(){
  const hebrew = bookGroup(state.bookId) === 'ot', lang = langLabels(hebrew);
  el.interlinearToggle.title = 'Show ' + lang.name + ' line';
  el.interlinearToggle.querySelector('.full').textContent = lang.name;
  const short = el.interlinearToggle.querySelector('.short');
  short.textContent = lang.symbol;
  short.className = 'short ' + (hebrew ? 'hebrew' : 'greek');
  el.greekTab.textContent = lang.name;
}
// Everything in the top bar / panel that depends on which book is open.
export async function syncBookControls(){
  markActiveBook();
  await populateChapterPicker();
  renderTranslationSelect();
  setLanguageLabels();
}

// Chapters of the open book that have anything visible under the canon profile.
let chapterList = [];
async function populateChapterPicker(){
  const name = bookName(state.bookId);
  chapterList = CAT.translations[state.shown].live
    ? CAT.translations[state.shown].books[state.bookId].chapters
    : await lib.chapters(state.shown, state.bookId, state.canon);
  el.bookLabel.textContent = name;
  el.chapterLabel.textContent = state.chapter;
  el.chapterPickerTitle.textContent = name;
  el.chapterList.innerHTML = '';
  for(const c of chapterList){
    const btn = document.createElement('button');
    btn.className = 'ch-btn' + (c === state.chapter ? ' active' : '');
    btn.textContent = c;
    btn.addEventListener('click', ()=>{ closePickers(); selectChapter(c); });
    el.chapterList.appendChild(btn);
  }
  el.prevCh.disabled = state.chapter <= chapterList[0];
  el.nextCh.disabled = state.chapter >= chapterList[chapterList.length - 1];
}

/* ---------- moving around ---------- */
async function selectBook(code, tr, chapter){
  state.bookId = code; state.shown = tr; state.selectedVerse = null;
  const chs = CAT.translations[tr].live ? CAT.translations[tr].books[code].chapters : await lib.chapters(tr, code, state.canon);
  state.chapter = chapter && chs.includes(chapter) ? chapter : chs[0];
  closePanel();
  el.readingInner.innerHTML = '<div class="loading">Loading '+bookName(code)+'&hellip;</div>';
  await syncBookControls();
  await showChapter();
  savePrefs();
}
async function selectChapter(c){
  state.chapter = c; state.selectedVerse = null;
  closePanel();
  await populateChapterPicker();
  await showChapter();
  savePrefs();
}
/* Put the reader on `tr`'s own verse for the pivots in view (the selected verse, else the chapter's first
   numbered verse). Falls back to the KJV where `tr` has no text there. Returns the verse located. */
export async function moveTo(tr){
  // anchor on the selected verse, else the first numbered verse (titles are folded into verse 1 in some)
  const row = state.rows.find(r=> r.verse === state.selectedVerse && r.text) ||
              state.rows.find(r=> r.text && r.verse > 0) || state.rows.find(r=> r.text);
  if(!row) return null;
  for(const t of tr === 'KJV' ? ['KJV'] : [tr, 'KJV']){
    if(t === state.shown) return { book: state.bookId, chapter: state.chapter, verse: row.verse };
    const loc = await lib.locate(t, row.pivots);
    if(loc && hasBook(t, loc.book, state.canon)){
      state.shown = t; state.bookId = loc.book; state.chapter = loc.chapter;
      return loc;
    }
  }
  return null;
}

/* ---------- reading pane ---------- */
export async function showChapter(){
  if(LIVE_TRANSLATIONS[state.shown] && !LIVE_TRANSLATIONS[state.shown].available()){
    state.translation = state.shown = 'KJV';
  }
  const code = state.shown;
  const live = LIVE_TRANSLATIONS[code];   // NASB / ESV: fetched through the Worker
  if(live){
    el.readingInner.innerHTML = '<div class="loading">Fetching ' + code + '&hellip;</div>';
    let verses;
    try{
      verses = await live.ensure(state.bookId, state.chapter);
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
      if(fallback) fallback.addEventListener('click', async ()=>{
        state.translation = state.shown = 'KJV'; await renderNav(); await syncBookControls(); showChapter(); savePrefs();
      });
      return;
    }
    state.rows = await lib.liveRows(code, state.bookId, state.chapter, verses);
    state.hidden = [];
  } else {
    const [visible, all] = await Promise.all([lib.chapter(code, state.bookId, state.chapter, state.canon),
                                              lib.chapter(code, state.bookId, state.chapter)]);
    state.rows = visible;
    state.hidden = all.filter(r=> !visible.some(v=> v.verse === r.verse) && r.text);
  }
  await Promise.all([ensureCitations(), ensureOriginal()]);
  renderChapter();
  // FUMS (NASB only): one view per chapter shown (not on Greek-line re-renders)
  if(live && live.report) live.report(state.bookId, state.chapter);
}
// Which verses of the chapter have church-father citations (the index only; bodies load in the panel).
let cited = null;   // {key, verses: Set}
async function ensureCitations(){
  const key = state.shown + '/' + state.bookId + '/' + state.chapter + '/' + state.canon;
  if(cited && cited.key === key) return;
  try{
    const counts = await Promise.all(state.rows.map(r=> lib.commentaryRefs('fathers', pivotsIn(r.pivots, state.canon))));
    cited = { key, verses: new Set(state.rows.filter((r, i)=> counts[i].length).map(r=> r.verse)) };
  }catch(e){ cited = null; /* marks stay off */ }
}
// The original-language words for the chapter in view, by pivot (loaded only when the line is on).
// Each verse shows the words on its own pivots: DRA Mark 8:39 shows the Greek of 9:1, a KJV psalm
// title (verse 0) the Hebrew title.
let original = null;   // {key, byPivot: {vid: [word]}}
async function ensureOriginal(){
  const lang = ORIGINAL_LANG[bookGroup(state.bookId)];
  const key = state.shown + '/' + state.bookId + '/' + state.chapter;
  if(!state.showGreek || !lang || (original && original.key === key)) return;
  try{
    const groups = await lib.originalForPivots(lang, state.rows.flatMap(r=> r.pivots));
    const byPivot = {};
    groups.forEach(g=> g.words.forEach(w=> (byPivot[w.pivot] = byPivot[w.pivot] || []).push(legacyWord(w))));
    original = { key, byPivot };
  }catch(e){ original = null; /* the line stays empty; turning it off and on retries */ }
}
const wordsOf = r=> (original && original.key === state.shown + '/' + state.bookId + '/' + state.chapter)
  ? r.pivots.flatMap(p=> original.byPivot[p] || []) : [];
function renderChapter(){
  const hebrew = bookGroup(state.bookId) === 'ot';
  const translation = state.shown;

  let html = '<h2 class="chapter-heading">'+bookName(state.bookId)+' '+state.chapter+'</h2>';
  html += '<p class="chapter-sub">'+translation+' &middot; tap a verse number to compare translations, read the '+langLabels(hebrew).name+', or see commentaries from the early church</p>';
  // ESV terms: the notice and esv.org link sit with the translation name, on every ESV page
  if(translation === 'ESV') html += '<p class="live-notice chapter-sub-notice">' + LIVE_TRANSLATIONS.ESV.notice + '</p>';

  // verses the canon hides inside this chapter, noted where they would be (runs of consecutive verses)
  const CANON_NAME = { protestant: 'Protestant', catholic: 'Catholic', orthodox: 'Orthodox' };
  const gaps = [];
  (state.hidden || []).forEach(r=>{
    const g = gaps[gaps.length - 1];
    if(g && r.verse === g.last + 1) g.last = r.verse; else gaps.push({ first: r.verse, last: r.verse });
  });
  const gapNote = g=> '<div class="canon-gap">' + (g.first === g.last ? 'Verse ' + g.first : 'Verses ' + g.first + '–' + g.last) +
    ' not shown: not in the ' + CANON_NAME[state.canon] + ' canon (change it in the book list).</div>';
  let gi = 0;
  state.rows.forEach(r=>{
    while(gi < gaps.length && gaps[gi].first < r.verse){ html += gapNote(gaps[gi]); gi++; }
    if(!r.text) return;                         // numbered but empty in this translation (e.g. WEB Acts 8:37)
    const vs = String(r.verse);
    const hasFathers = cited && cited.verses.has(r.verse);
    const mark = hasFathers ? '<span class="fmark" title="Church father citations available"></span>' : '';
    const words = state.showGreek ? wordsOf(r) : [];
    if(r.verse === 0){                          // psalm title: an unnumbered superscription
      html += '<div class="verse title" data-v="0"><div class="vbody"><div class="vtext" data-v="0">'+escapeHtml(r.text)+mark+'</div>';
    } else {
      html += '<div class="verse" data-v="'+vs+'">';
      html += '<button class="vnum" data-v="'+vs+'">'+vs+'</button>';
      html += '<div class="vbody">';
      html += '<div class="vtext" data-v="'+vs+'">'+escapeHtml(r.text)+mark+'</div>';
    }
    if(words.length){
      html += (hebrew ? '<div class="vgreek hebrew" dir="rtl">' : '<div class="vgreek">') + words.map(w=>
        '<button class="gword" data-s="'+ (w.s[0]||'') +'">'+
          '<span class="gk">'+escapeHtml(displayWord(w, hebrew))+'</span>'+
          '<span class="gl">'+escapeHtml(w.gl)+'</span>'+
        '</button>'
      ).join('') + '</div>';
    }
    html += '</div></div>';
  });

  while(gi < gaps.length){ html += gapNote(gaps[gi]); gi++; }
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
  const selected = state.selectedVerse;
  state.translation = el.translationSelect.value;
  const loc = await moveTo(state.translation);
  closePanel();
  await renderNav();
  await syncBookControls();
  await showChapter();
  if(selected !== null && loc && state.rows.some(r=> r.verse === loc.verse)) openVerse(loc.verse);
  savePrefs();
});
function stepChapter(d){
  const i = chapterList.indexOf(state.chapter) + d;
  if(i >= 0 && i < chapterList.length) selectChapter(chapterList[i]);
}
el.prevCh.addEventListener('click', ()=> stepChapter(-1));
el.nextCh.addEventListener('click', ()=> stepChapter(1));
el.interlinearCheck.addEventListener('change', async ()=>{
  state.showGreek = el.interlinearCheck.checked;
  await ensureOriginal();
  renderChapter(); savePrefs();
});

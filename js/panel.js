/* Verse detail panel: Compare / Greek-or-Hebrew / Commentary tabs. */
import { state, el, escapeHtml } from './app.js';
import { CAT, lib, translationName, bookName, bookGroup, pivotsIn } from './data.js';
import { LIVE_TRANSLATIONS } from './live.js';
import { decodeMorph, displayWord, showLexicon, hideLexicon, ORIGINAL_LANG, legacyWord, noOriginalNote } from './greek.js';

const ABSENT_NOTE = {
  'not-in-translation': code=> 'Not in ' + code + '.',
  variant: code=> 'No text here in ' + code + ': a verse that some manuscripts omit.',
  empty: code=> 'No text here in ' + code + ': a verse that some manuscripts omit.',
  recension: code=> 'Not linked: ' + code + ' translates a different form of this book (the Vulgate\'s), whose verses don\'t correspond.',
  missing: code=> 'No corresponding verse in ' + code + '.',
};
const refLabel = r=> bookName(r.book) + ' ' + r.chapter + ':' + r.verse;

export async function openVerse(vn){
  state.selectedVerse = vn;
  [...el.readingInner.querySelectorAll('.verse')].forEach(v=> v.classList.toggle('selected', parseInt(v.dataset.v,10)===vn));
  const vs = String(vn);

  el.panelRef.textContent = bookName(state.bookId) + ' ' + state.chapter + (vn ? ':' + vs : ', title');
  el.paneCompare.innerHTML = '<div class="loading" style="padding:30px 0">Loading&hellip;</div>';
  showTab('compare');
  openPanel();

  /* Compare tab: every translation's own verses on this verse's pivots, under their own references */
  const codes = Object.keys(CAT.translations).filter(c=> !LIVE_TRANSLATIONS[c] || LIVE_TRANSLATIONS[c].available());
  let results;
  try{ results = await lib.compare(state.shown, state.bookId, state.chapter, vn, codes, state.canon); }
  catch(e){ results = null; }
  if(state.selectedVerse !== vn) return; // user moved on while we were loading
  if(!results){
    el.paneCompare.innerHTML = '<div class="empty-state">Couldn\'t load the other translations. <button class="cmp-load" id="compareRetry">Try again</button></div>';
    document.getElementById('compareRetry').addEventListener('click', ()=> openVerse(vn));
  } else {
    let cmp = '';
    const live = [];
    results.sort((a, b)=> codes.indexOf(a.translation) - codes.indexOf(b.translation));   // display order
    results.forEach(r=>{
      const code = r.translation, primary = code === state.shown;
      if(r.live && !r.absent){ cmp += '<div class="cmp-item live" id="liveRow-'+code+'"></div>'; live.push(r); return; }
      const label = '<div class="cmp-label"><span class="cmp-code">'+code+'</span><span class="cmp-name">'+translationName(code)+'</span></div>';
      if(r.absent){
        // a psalm title: translations without separate titles (or live ones, fetched without them) say so
        const note = vn === 0 && (r.absent !== 'not-in-translation' || r.live) ? 'No separate title in ' + code + '.' : ABSENT_NOTE[r.absent](code);
        cmp += '<div class="cmp-item absent">'+label+'<div class="cmp-note">'+note+'</div></div>';
        return;
      }
      cmp += '<div class="cmp-item'+(primary?' primary':'')+'">'+label+ r.verses.map(v=>
        (v.renumbered || r.verses.length > 1 ? '<div class="cmp-ref">'+escapeHtml(refLabel(v))+'</div>' : '')+
        '<div class="cmp-text">'+escapeHtml(v.text)+'</div>').join('') + '</div>';
    });
    // translations that don't have this part of the Bible go last
    el.paneCompare.innerHTML = cmp || '<div class="empty-state">No text found for this verse.</div>';
    const absentRows = [...el.paneCompare.querySelectorAll('.cmp-item.absent')];
    absentRows.forEach(n=> el.paneCompare.appendChild(n));
    for(const r of live){
      liveRefs[r.translation] = r.verses;
      const text = await cachedLiveText(r.translation, r.verses);
      if(state.selectedVerse !== vn) return;
      renderLiveRow(r.translation, vn, text ? 'text' : 'idle', text);
    }
  }

  /* Greek / Hebrew tab: words load (own file) when the tab opens */
  const row = state.rows.find(r=> r.verse === vn);
  greekFor = { vn, lang: ORIGINAL_LANG[bookGroup(state.bookId)], pivots: row ? row.pivots : [], rendered: false };
  el.paneGreek.innerHTML = '';
  if(document.getElementById('pane-greek').classList.contains('active')) renderGreekTab();

  /* Fathers tab: the count comes from the index; quote bodies load when the tab opens. Only citations on
     the verse's pivots inside the canon profile count (DRA Daniel 13:1 = Susanna 1:1). */
  const pivots = row ? pivotsIn(row.pivots, state.canon) : [];
  let refs = [];
  try{ refs = await lib.commentaryRefs('fathers', pivots); }catch(e){}
  if(state.selectedVerse !== vn) return;
  el.fathersBadge.textContent = refs.length;
  fathersFor = { vn, pivots, count: refs.length, rendered: false };
  el.paneFathers.innerHTML = '';
  if(document.getElementById('pane-fathers').classList.contains('active')) renderFathers();
}

// The verse whose words the Greek/Hebrew tab shows (fetched on first view): the words on the verse's
// own pivots, so DRA Mark 8:39 shows the Greek of Mark 9:1.
let greekFor = null;
async function renderGreekTab(){
  const f = greekFor;
  if(!f || f.rendered) return;
  f.rendered = true;
  const hebrew = f.lang === 'hbo';
  let words = [];
  if(f.lang && f.pivots.length){
    el.paneGreek.innerHTML = '<div class="loading" style="padding:30px 0">Loading&hellip;</div>';
    try{ words = (await lib.originalForPivots(f.lang, f.pivots)).flatMap(g=> g.words.map(legacyWord)); }
    catch(e){
      if(greekFor !== f) return;
      f.rendered = false;
      el.paneGreek.innerHTML = '<div class="empty-state">Couldn\'t load the original-language text. <button class="cmp-load" id="greekRetry">Try again</button></div>';
      document.getElementById('greekRetry').addEventListener('click', renderGreekTab);
      return;
    }
    if(greekFor !== f) return;   // another verse was opened meanwhile
  }
  if(words.length){
    let g = hebrew
      ? '<p class="interlinear-note">Word-by-word Hebrew for this verse (Aramaic in parts of Daniel and Ezra), from the Westminster Leningrad Codex as tagged by the Open Scriptures Hebrew Bible. Tap a word for its full lexicon entry.</p>'
      : '<p class="interlinear-note">Word-by-word Greek for this verse, drawn from the critical editions (NA/SBL/TR family). Tap a word for its full lexicon entry.</p>';
    g += words.map(w=>
      '<button class="iword" data-s="'+(w.s[0]||'')+'">'+
        (hebrew ? '<span class="igk hebrew" dir="rtl">' : '<span class="igk">')+escapeHtml(displayWord(w, hebrew))+'</span>'+
        '<span class="imeta"><span class="igloss">'+escapeHtml(w.gl)+(w.t && w.t.trim() && w.t.trim()!==w.gl ? ' <span style="color:var(--ink-faint)">&mdash; "'+escapeHtml(w.t.trim())+'" here</span>':'')+'</span>'+
        '<span class="imorph">'+escapeHtml(decodeMorph(w.m, hebrew))+'</span></span>'+
      '</button>'
    ).join('');
    el.paneGreek.innerHTML = g;
    el.paneGreek.querySelectorAll('.iword').forEach(node=>{
      node.addEventListener('click', ()=> showLexicon(node.dataset.s, node));
    });
  } else {
    el.paneGreek.innerHTML = '<div class="empty-state">' + noOriginalNote(f.vn, hebrew) + '</div>';
  }
}

// The verse whose citations the Fathers tab shows (bodies are fetched on first view).
let fathersFor = null;
async function renderFathers(){
  const f = fathersFor;
  if(!f || f.rendered) return;
  f.rendered = true;
  if(!f.count){
    el.paneFathers.innerHTML = '<div class="empty-state">No surviving citations from this era (c. 100–800 AD) are indexed for this verse yet.</div>';
    return;
  }
  el.paneFathers.innerHTML = '<div class="loading" style="padding:30px 0">Loading&hellip;</div>';
  let quotes;
  try{ quotes = await lib.commentary('fathers', f.pivots); }
  catch(e){
    if(fathersFor !== f) return;
    f.rendered = false;
    el.paneFathers.innerHTML = '<div class="empty-state">Couldn\'t load the citations. <button class="cmp-load" id="fathersRetry">Try again</button></div>';
    document.getElementById('fathersRetry').addEventListener('click', renderFathers);
    return;
  }
  if(fathersFor !== f) return;   // another verse was opened meanwhile
  quotes.sort((a,b)=> a.father.localeCompare(b.father));
  el.paneFathers.innerHTML = quotes.map(q=>
    '<div class="father-item">'+
      '<div class="father-name">'+escapeHtml(q.father)+'</div>'+
      '<div class="father-source">'+escapeHtml(q.source_title)+'</div>'+
      '<div class="father-quote">'+escapeHtml(q.quote)+'</div>'+
      (q.source_url ? '<a class="father-link" href="'+q.source_url+'" target="_blank" rel="noopener">Read the full source ↗</a>' : '')+
    '</div>'
  ).join('');
}
// Live translations (NASB, NIV, NKJV, ESV) use only a local copy when the panel opens; otherwise their row offers a
// Load button rather than fetching on every panel open. A row can span verses in another numbering
// (e.g. ESV 3 John 1:14-15 for KJV 1:14), so it works from the refs Compare returned.
const liveRefs = {};   // translation -> [{book, chapter, verse, renumbered}] for the open verse
async function cachedLiveText(code, refs){
  const live = LIVE_TRANSLATIONS[code], parts = [];
  for(const r of refs){
    const t = ((await live.getCached(r.book, r.chapter)) || {})[String(r.verse)];
    if(!t) return null;
    parts.push({ ref: r, text: t });
  }
  return parts;
}
// Live-translation row states: 'idle' (Load button), 'loading', 'error' (Try again), 'text'.
function renderLiveRow(code, vn, status, parts){
  const live = LIVE_TRANSLATIONS[code];
  const row = document.getElementById('liveRow-' + code);
  if(!row || state.selectedVerse !== vn) return;
  const primary = state.shown === code;
  row.className = 'cmp-item live' + (primary && status === 'text' ? ' primary' : '');
  let body;
  if(status === 'text') body = (parts && parts.length
      ? parts.map(p=> (p.ref.renumbered || parts.length > 1 ? '<div class="cmp-ref">'+escapeHtml(refLabel(p.ref))+'</div>' : '')+
                      '<div class="cmp-text">'+escapeHtml(p.text)+'</div>').join('')
      : '<div class="cmp-note">No ' + code + ' text for this verse.</div>') +
    '<div class="live-notice cmp-notice">' + live.notice + '</div>';
  else if(status === 'loading') body = '<div class="cmp-note">Loading&hellip;</div>';
  else if(status === 'error') body = '<div class="cmp-note">Couldn\'t load the ' + code + '. <button class="cmp-load">Try again</button></div>';
  else body = '<div class="cmp-note">Fetched live from ' + live.source + '. <button class="cmp-load">Load</button></div>';
  row.innerHTML =
    '<div class="cmp-label"><span class="cmp-code">' + code + '</span><span class="cmp-name">'+translationName(code)+'</span>'+
    '<span class="cmp-live-tag">LIVE</span></div>' + body;
  if(status === 'text' && parts && parts.length && live.report)       // FUMS (api.bible): each chapter shown
    [...new Set(parts.map(p=> p.ref.book + '/' + p.ref.chapter))].forEach(k=>{ const [b, c] = k.split('/'); live.report(b, Number(c)); });
  const btn = row.querySelector('.cmp-load');
  if(btn) btn.addEventListener('click', async ()=>{
    renderLiveRow(code, vn, 'loading');
    try{
      const refs = liveRefs[code] || [];
      for(const k of new Set(refs.map(r=> r.book + '/' + r.chapter))){ const [b, c] = k.split('/'); await live.ensure(b, Number(c)); }
      renderLiveRow(code, vn, 'text', (await cachedLiveText(code, refs)) || []);
    }catch(e){ renderLiveRow(code, vn, 'error'); }
  });
}

function showTab(name){
  document.querySelectorAll('.tab-btn').forEach(b=> b.classList.toggle('active', b.dataset.pane===name));
  document.querySelectorAll('.panel-pane').forEach(p=> p.classList.toggle('active', p.id==='pane-'+name));
  if(name === 'fathers') renderFathers();
  if(name === 'greek') renderGreekTab();
}
document.querySelectorAll('.tab-btn').forEach(b=> b.addEventListener('click', ()=> showTab(b.dataset.pane)));

function openPanel(){ el.overlay.classList.add('show'); el.panel.classList.add('show'); }
export function closePanel(){
  el.overlay.classList.remove('show'); el.panel.classList.remove('show');
  state.selectedVerse = null;
  [...el.readingInner.querySelectorAll('.verse')].forEach(v=> v.classList.remove('selected'));
}
el.panelClose.addEventListener('click', closePanel);
el.overlay.addEventListener('click', ()=>{ closePanel(); hideLexicon(); });

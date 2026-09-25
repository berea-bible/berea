/* Verse detail panel: Compare / Greek-or-Hebrew / Commentary tabs. */
import { state, el, escapeHtml } from './app.js';
import { bookCache, bookMeta, isOT, translationCodes, translationName, effectiveTranslation, LIVE_TRANSLATIONS, loadQuotes, loadOriginal } from './data.js';
import { decodeMorph, displayWord, showLexicon, hideLexicon } from './greek.js';

export async function openVerse(vn){
  state.selectedVerse = vn;
  [...el.readingInner.querySelectorAll('.verse')].forEach(v=> v.classList.toggle('selected', parseInt(v.dataset.v,10)===vn));
  const meta = bookMeta(state.bookId);
  const ch = String(state.chapter), vs = String(vn);

  el.panelRef.textContent = meta.name + ' ' + state.chapter + ':' + vs;
  el.paneCompare.innerHTML = '<div class="loading" style="padding:30px 0">Loading&hellip;</div>';
  showTab('compare');
  openPanel();

  // Live translations (NASB, ESV) only use a local copy here; otherwise their row offers a
  // Load button rather than fetching on every panel open.
  const liveText = {};
  for(const [code, live] of Object.entries(LIVE_TRANSLATIONS)){
    if(live.available()) liveText[code] = ((await live.getCached(state.bookId, state.chapter)) || {})[vs] || null;
  }
  if(state.selectedVerse !== vn) return; // user moved on while we were reading the cache

  const book = bookCache[state.bookId];

  /* Compare tab */
  const shown = effectiveTranslation(state.translation, state.bookId);
  let cmp = '';
  translationCodes(state.bookId).forEach(code=>{
    if(LIVE_TRANSLATIONS[code]){ cmp += '<div class="cmp-item live" id="liveRow-'+code+'"></div>'; return; }
    const text = ((book.translations[code]||{})[ch]||{})[vs];
    if(!text) return;
    cmp += '<div class="cmp-item'+(code===shown?' primary':'')+'">'+
      '<div class="cmp-label"><span class="cmp-code">'+code+'</span><span class="cmp-name">'+translationName(code)+'</span></div>'+
      '<div class="cmp-text">'+escapeHtml(text)+'</div></div>';
  });
  el.paneCompare.innerHTML = cmp || '<div class="empty-state">No text found for this verse.</div>';
  for(const code in liveText) renderLiveRow(code, vn, liveText[code] ? 'text' : 'idle', liveText[code]);

  /* Greek / Hebrew tab: words load (own file) when the tab opens */
  greekFor = { vn, bookId: state.bookId, ch, vs, rendered: false };
  el.paneGreek.innerHTML = '';
  if(document.getElementById('pane-greek').classList.contains('active')) renderGreekTab();

  /* Fathers tab: the count comes from the verse index; quote bodies load when the tab opens */
  const refs = ((book.fathers[ch]||{})[vs]) || [];
  el.fathersBadge.textContent = refs.length;
  fathersFor = { vn, bookId: state.bookId, chapter: state.chapter, refs, rendered: false };
  el.paneFathers.innerHTML = '';
  if(document.getElementById('pane-fathers').classList.contains('active')) renderFathers();
}

// The verse whose words the Greek/Hebrew tab shows (fetched on first view).
let greekFor = null;
async function renderGreekTab(){
  const f = greekFor;
  if(!f || f.rendered) return;
  f.rendered = true;
  const book = bookCache[f.bookId];
  if(!book.greek){
    el.paneGreek.innerHTML = '<div class="loading" style="padding:30px 0">Loading&hellip;</div>';
    try{ book.greek = await loadOriginal(f.bookId); }
    catch(e){
      if(greekFor !== f) return;
      f.rendered = false;
      el.paneGreek.innerHTML = '<div class="empty-state">Couldn\'t load the original-language text. <button class="cmp-load" id="greekRetry">Try again</button></div>';
      document.getElementById('greekRetry').addEventListener('click', renderGreekTab);
      return;
    }
    if(greekFor !== f) return;   // another verse was opened meanwhile
  }
  const hebrew = isOT(f.bookId);
  const words = ((book.greek[f.ch]||{})[f.vs]) || [];
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
    el.paneGreek.innerHTML = hebrew
      ? '<div class="empty-state">This verse has no counterpart in the Hebrew (Masoretic) text.</div>'
      : '<div class="empty-state">No tagged Greek text is available for this verse.</div>';
  }
}

// The verse whose citations the Fathers tab shows (bodies are fetched on first view).
let fathersFor = null;
async function renderFathers(){
  const f = fathersFor;
  if(!f || f.rendered) return;
  f.rendered = true;
  if(!f.refs.length){
    el.paneFathers.innerHTML = '<div class="empty-state">No surviving citations from this era (c. 100–800 AD) are indexed for this verse yet.</div>';
    return;
  }
  el.paneFathers.innerHTML = '<div class="loading" style="padding:30px 0">Loading&hellip;</div>';
  let quotes;
  try{ quotes = await loadQuotes(f.bookId, f.chapter, f.refs); }
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
// Live-translation row states: 'idle' (Load button), 'loading', 'error' (Try again), 'text'.
const LIVE_SOURCE = { NASB: 'api.bible', ESV: 'api.esv.org' };
function renderLiveRow(code, vn, status, text){
  const live = LIVE_TRANSLATIONS[code];
  const row = document.getElementById('liveRow-' + code);
  if(!row || state.selectedVerse !== vn) return;
  const primary = effectiveTranslation(state.translation, state.bookId) === code;
  row.className = 'cmp-item live' + (primary && status === 'text' ? ' primary' : '');
  let body;
  if(status === 'text') body = (text ? '<div class="cmp-text">'+escapeHtml(text)+'</div>'
                                     : '<div class="cmp-note">No ' + code + ' text for this verse.</div>') +
                               '<div class="live-notice cmp-notice">' + live.notice + '</div>';
  else if(status === 'loading') body = '<div class="cmp-note">Loading&hellip;</div>';
  else if(status === 'error') body = '<div class="cmp-note">Couldn\'t load the ' + code + '. <button class="cmp-load">Try again</button></div>';
  else body = '<div class="cmp-note">Fetched live from ' + LIVE_SOURCE[code] + '. <button class="cmp-load">Load</button></div>';
  row.innerHTML =
    '<div class="cmp-label"><span class="cmp-code">' + code + '</span><span class="cmp-name">'+translationName(code)+'</span>'+
    '<span class="cmp-live-tag">LIVE</span></div>' + body;
  if(status === 'text' && text && live.report) live.report(state.bookId, state.chapter); // FUMS (NASB)
  const btn = row.querySelector('.cmp-load');
  if(btn) btn.addEventListener('click', async ()=>{
    renderLiveRow(code, vn, 'loading');
    try{
      const verses = await live.ensure(state.bookId, state.chapter);
      renderLiveRow(code, vn, 'text', verses[String(vn)]);
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

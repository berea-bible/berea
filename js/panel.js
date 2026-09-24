/* Verse detail panel: Compare / Greek-or-Hebrew / Commentary tabs. */
import { state, el, escapeHtml } from './app.js';
import { bookCache, bookMeta, isOT, nasbAvailable, ensureNasbChapter, getCachedNasbChapter, translationCodes, translationName, effectiveTranslation, NASB_NOTICE_HTML } from './data.js';
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

  // NASB comes from api.bible, so only a local copy is used here; otherwise the row
  // offers a Load button rather than fetching on every panel open.
  const nasbText = nasbAvailable()
    ? ((await getCachedNasbChapter(state.bookId, state.chapter)) || {})[vs] : null;
  if(state.selectedVerse !== vn) return; // user moved on while we were reading the cache

  const book = bookCache[state.bookId];

  /* Compare tab */
  const shown = effectiveTranslation(state.translation, state.bookId);
  let cmp = '';
  translationCodes(state.bookId).forEach(code=>{
    if(code === 'NASB'){ cmp += '<div class="cmp-item live" id="nasbRow"></div>'; return; }
    const text = ((book.translations[code]||{})[ch]||{})[vs];
    if(!text) return;
    cmp += '<div class="cmp-item'+(code===shown?' primary':'')+'">'+
      '<div class="cmp-label"><span class="cmp-code">'+code+'</span><span class="cmp-name">'+translationName(code)+'</span></div>'+
      '<div class="cmp-text">'+escapeHtml(text)+'</div></div>';
  });
  el.paneCompare.innerHTML = cmp || '<div class="empty-state">No text found for this verse.</div>';
  if(nasbAvailable()) renderNasbRow(vn, nasbText ? 'text' : 'idle', nasbText);

  /* Greek / Hebrew tab */
  const hebrew = isOT(state.bookId);
  const words = ((book.greek[ch]||{})[vs]) || [];
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

  /* Fathers tab */
  const qIdxs = ((book.fathers[ch]||{})[vs]) || [];
  el.fathersBadge.textContent = qIdxs.length;
  if(qIdxs.length){
    const quotes = qIdxs.map(i => book.quotes[i]).sort((a,b)=> a.father.localeCompare(b.father));
    el.paneFathers.innerHTML = quotes.map(q=>
      '<div class="father-item">'+
        '<div class="father-name">'+escapeHtml(q.father)+'</div>'+
        '<div class="father-source">'+escapeHtml(q.source_title)+'</div>'+
        '<div class="father-quote">'+escapeHtml(q.quote)+'</div>'+
        (q.source_url ? '<a class="father-link" href="'+q.source_url+'" target="_blank" rel="noopener">Read the full source ↗</a>' : '')+
      '</div>'
    ).join('');
  } else {
    el.paneFathers.innerHTML = '<div class="empty-state">No surviving citations from this era (c. 100–800 AD) are indexed for this verse yet.</div>';
  }
}
// NASB row states: 'idle' (Load button), 'loading', 'error' (Try again), 'text'.
function renderNasbRow(vn, status, text){
  const row = document.getElementById('nasbRow');
  if(!row || state.selectedVerse !== vn) return;
  const primary = effectiveTranslation(state.translation, state.bookId) === 'NASB';
  row.className = 'cmp-item live' + (primary && status === 'text' ? ' primary' : '');
  let body;
  if(status === 'text') body = (text ? '<div class="cmp-text">'+escapeHtml(text)+'</div>'
                                     : '<div class="cmp-note">No NASB text for this verse.</div>') +
                               '<div class="nasb-notice cmp-notice">' + NASB_NOTICE_HTML + '</div>';
  else if(status === 'loading') body = '<div class="cmp-note">Loading&hellip;</div>';
  else if(status === 'error') body = '<div class="cmp-note">Couldn\'t load the NASB. <button class="cmp-load">Try again</button></div>';
  else body = '<div class="cmp-note">Fetched live from api.bible. <button class="cmp-load">Load</button></div>';
  row.innerHTML =
    '<div class="cmp-label"><span class="cmp-code">NASB</span><span class="cmp-name">'+translationName('NASB')+'</span>'+
    '<span class="cmp-live-tag">LIVE</span></div>' + body;
  const btn = row.querySelector('.cmp-load');
  if(btn) btn.addEventListener('click', async ()=>{
    renderNasbRow(vn, 'loading');
    try{
      const verses = await ensureNasbChapter(state.bookId, state.chapter);
      renderNasbRow(vn, 'text', verses[String(vn)]);
    }catch(e){ renderNasbRow(vn, 'error'); }
  });
}

function showTab(name){
  document.querySelectorAll('.tab-btn').forEach(b=> b.classList.toggle('active', b.dataset.pane===name));
  document.querySelectorAll('.panel-pane').forEach(p=> p.classList.toggle('active', p.id==='pane-'+name));
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

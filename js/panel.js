/* Verse detail panel: Compare / Greek / Commentary tabs. */
import { state, el, escapeHtml } from './app.js';
import { bookCache, bookMeta, nasbAvailable, ensureNasbChapter, translationCodes, translationName } from './data.js';
import { decodeMorph, showLexicon, hideLexicon } from './greek.js';

export async function openVerse(vn){
  state.selectedVerse = vn;
  [...el.readingInner.querySelectorAll('.verse')].forEach(v=> v.classList.toggle('selected', parseInt(v.dataset.v,10)===vn));
  const meta = bookMeta(state.bookId);
  const ch = String(state.chapter), vs = String(vn);

  el.panelRef.textContent = meta.name + ' ' + state.chapter + ':' + vs;
  el.paneCompare.innerHTML = '<div class="loading" style="padding:30px 0">Loading&hellip;</div>';
  showTab('compare');
  openPanel();

  if(nasbAvailable()){
    try{ await ensureNasbChapter(state.bookId, state.chapter); }
    catch(e){ /* fall through — compare tab just omits NASB for this verse */ }
  }
  if(state.selectedVerse !== vn) return; // user moved on while we were fetching

  const book = bookCache[state.bookId];

  /* Compare tab */
  let cmp = '';
  translationCodes().forEach(code=>{
    const text = ((book.translations[code]||{})[ch]||{})[vs];
    if(!text) return;
    const isLive = code === 'NASB';
    cmp += '<div class="cmp-item'+(code===state.translation?' primary':'')+(isLive?' live':'')+'">'+
      '<div class="cmp-label"><span class="cmp-code">'+code+'</span><span class="cmp-name">'+translationName(code)+'</span>'+
      (isLive ? '<span class="cmp-live-tag">LIVE</span>' : '')+'</div>'+
      '<div class="cmp-text">'+escapeHtml(text)+'</div></div>';
  });
  el.paneCompare.innerHTML = cmp || '<div class="empty-state">No text found for this verse.</div>';

  /* Greek tab */
  const words = ((book.greek[ch]||{})[vs]) || [];
  if(words.length){
    let g = '<p class="interlinear-note">Word-by-word Greek for this verse, drawn from the critical editions (NA/SBL/TR family). Tap a word for its full lexicon entry.</p>';
    g += words.map(w=>
      '<button class="iword" data-s="'+(w.s[0]||'')+'">'+
        '<span class="igk">'+escapeHtml(w.g)+'</span>'+
        '<span class="imeta"><span class="igloss">'+escapeHtml(w.gl)+(w.t && w.t.trim() && w.t.trim()!==w.gl ? ' <span style="color:var(--ink-faint)">&mdash; "'+escapeHtml(w.t.trim())+'" here</span>':'')+'</span>'+
        '<span class="imorph">'+escapeHtml(decodeMorph(w.m))+'</span></span>'+
      '</button>'
    ).join('');
    el.paneGreek.innerHTML = g;
    el.paneGreek.querySelectorAll('.iword').forEach(node=>{
      node.addEventListener('click', ()=> showLexicon(node.dataset.s, node));
    });
  } else {
    el.paneGreek.innerHTML = '<div class="empty-state">This verse falls outside the tagged Greek New Testament data (Matthew&ndash;Revelation).</div>';
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

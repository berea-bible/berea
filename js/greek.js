/* Greek helpers: morphology-code decoder and the lexicon popover. */
import { el, escapeHtml } from './app.js';
import { loadLexicon } from './data.js';

/* ---------- morphology decoder ---------- */
const MORPH_CASE = {N:'Nominative',G:'Genitive',D:'Dative',A:'Accusative',V:'Vocative'};
const MORPH_NUM  = {S:'Singular',P:'Plural'};
const MORPH_GEN  = {M:'Masculine',F:'Feminine',N:'Neuter'};
const MORPH_TENSE= {P:'Present',I:'Imperfect',F:'Future',A:'Aorist',R:'Perfect',L:'Pluperfect',X:''};
const MORPH_VOICE= {A:'Active',M:'Middle',P:'Passive',E:'Mid/Pass',D:'Middle Deponent',O:'Passive Deponent',N:'Mid/Pass Deponent'};
const MORPH_MOOD = {I:'Indicative',S:'Subjunctive',O:'Optative',M:'Imperative',N:'Infinitive',P:'Participle'};
const POS_NAMES = {
  N:'Noun', V:'Verb', A:'Adjective', T:'Article', CONJ:'Conjunction', P:'Personal Pronoun',
  PREP:'Preposition', PRT:'Particle', ADV:'Adverb', D:'Demonstrative Pronoun', R:'Relative Pronoun',
  COND:'Conditional Particle', I:'Interrogative Pronoun', X:'Indefinite Pronoun', INJ:'Interjection',
  F:'Reflexive Pronoun', S:'Possessive Pronoun', Q:'Correlative Pronoun', C:'Numeral', K:'Particle'
};
export function decodeMorph(m){
  if(!m) return '';
  const compound = m.indexOf(' +') !== -1;
  const main = m.split(' +')[0];
  const segs = main.split('-');
  const pos = segs[0];
  const posName = POS_NAMES[pos] || pos;
  const rest = segs.slice(1);
  let bits = [];
  if(pos === 'V' && rest.length){
    const tam = rest[0] || '';
    const t = MORPH_TENSE[tam[0]], v = MORPH_VOICE[tam[1]], md = MORPH_MOOD[tam[2]];
    [t,v,md].forEach(x=>{ if(x) bits.push(x); });
    const pn = rest[1] || '';
    if(/^[123]/.test(pn)){
      const p = pn[0]; const ord = p==='1'?'1st':p==='2'?'2nd':'3rd';
      const num = MORPH_NUM[pn[1]];
      bits.push(ord + ' Person' + (num? ', '+num : ''));
    } else if(pn){
      const c = MORPH_CASE[pn[0]], n = MORPH_NUM[pn[1]], g = MORPH_GEN[pn[2]];
      [c,n,g].forEach(x=>{ if(x) bits.push(x); });
    }
  } else if(rest.length){
    const cgn = rest[0];
    const c = MORPH_CASE[cgn[0]], n = MORPH_NUM[cgn[1]], g = MORPH_GEN[cgn[2]];
    [c,n,g].forEach(x=>{ if(x) bits.push(x); });
    if(rest[1] === 'P') bits.push('Proper Noun');
  }
  let out = posName + (bits.length ? ' · ' + bits.join(', ') : '');
  if(compound) out += ' (compound)';
  return out;
}

/* ---------- lexicon popover ---------- */
export async function showLexicon(strongs, anchor){
  if(!strongs){ el.lexPop.innerHTML = '<div class="empty-state">No lexicon entry available.</div>'; }
  else {
    el.lexPop.innerHTML = '<div class="loading" style="padding:20px 0">Loading entry&hellip;</div>';
  }
  positionPopover(anchor);
  el.lexPop.classList.add('show'); el.lexBackdrop.classList.add('show');
  if(!strongs) return;
  const lex = await loadLexicon();
  const entry = lex[strongs];
  if(!entry){
    el.lexPop.innerHTML = '<div class="empty-state">No lexicon entry for '+strongs+'.</div>';
    return;
  }
  el.lexPop.innerHTML =
    '<div class="lex-head"><div><div class="lex-greek">'+escapeHtml(entry.greek)+'</div>'+
    '<div class="lex-translit">'+escapeHtml(entry.translit)+'</div>'+
    '<div class="lex-strongs">'+strongs+'</div></div>'+
    '<button class="lex-close" aria-label="Close">&#10005;</button></div>'+
    '<span class="lex-pos">'+escapeHtml(entry.pos)+'</span>'+
    '<div class="lex-gloss">'+escapeHtml(entry.gloss)+'</div>'+
    '<div class="lex-def">'+escapeHtml(entry.definition)+'</div>';
  el.lexPop.querySelector('.lex-close').addEventListener('click', hideLexicon);
  positionPopover(anchor);
}
function positionPopover(anchor){
  const r = anchor.getBoundingClientRect();
  const popW = Math.min(300, window.innerWidth*0.88);
  let left = r.left;
  let top = r.bottom + 8;
  if(left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if(left < 12) left = 12;
  const maxTop = window.innerHeight - 60;
  if(top > maxTop) top = Math.max(12, r.top - 8 - 300);
  el.lexPop.style.left = left + 'px';
  el.lexPop.style.top = Math.min(top, maxTop) + 'px';
}
export function hideLexicon(){ el.lexPop.classList.remove('show'); el.lexBackdrop.classList.remove('show'); }
el.lexBackdrop.addEventListener('click', hideLexicon);
window.addEventListener('resize', ()=>{ if(el.lexPop.classList.contains('show')) hideLexicon(); });

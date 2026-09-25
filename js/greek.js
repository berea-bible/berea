/* Original-language helpers (Greek NT, Hebrew/Aramaic OT): morphology decoders,
   word display, and the lexicon popover. */
import { el, escapeHtml } from './app.js';
import { lib } from './data.js';

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
// The caller says which scheme applies (OT book => OSHB); the codes themselves are
// ambiguous (e.g. Greek "ADV" vs an Aramaic-prefixed "A..." code).
export function decodeMorph(m, hebrew){
  return hebrew ? decodeHebrewMorph(m) : decodeGreekMorph(m);
}
function decodeGreekMorph(m){
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

/* ---------- Hebrew/Aramaic (OSHB) morphology decoder ----------
   e.g. "HR/Ncfsa", "HVqp3ms", "AVpi1cp": a language prefix (H Hebrew, A Aramaic),
   then "/"-separated segments (prefixes, the word, suffixes), each starting with a
   part-of-speech letter. */
const HEB_GEN   = {b:'Both genders', c:'Common', f:'Feminine', m:'Masculine'};
const HEB_NUM   = {d:'Dual', p:'Plural', s:'Singular'};
const HEB_STATE = {a:'Absolute', c:'Construct', d:'Determined'};
const HEB_PERSON= {1:'1st Person', 2:'2nd Person', 3:'3rd Person'};
const HEB_STEM  = {q:'Qal', N:'Niphal', p:'Piel', P:'Pual', h:'Hiphil', H:'Hophal', t:'Hithpael',
  o:'Polel', O:'Polal', r:'Hithpolel', m:'Poel', M:'Poal', k:'Palel', K:'Pulal', Q:'Qal Passive',
  l:'Pilpel', L:'Polpal', f:'Hithpalpel', D:'Nithpael', j:'Pealal', i:'Pilel', u:'Hothpaal',
  c:'Tiphil', v:'Hishtaphel', w:'Nithpalel', y:'Nithpoel', z:'Hithpoel'};
const ARAM_STEM = {q:'Peal', Q:'Peil', u:'Hithpeel', p:'Pael', P:'Ithpaal', M:'Hithpaal', a:'Aphel',
  h:'Haphel', s:'Saphel', e:'Shaphel', H:'Hophal', i:'Ithpeel', t:'Hishtaphel', v:'Ishtaphel',
  w:'Hithaphel', o:'Polel', z:'Ithpoel', r:'Hithpolel', f:'Hithpalpel', b:'Hephal', c:'Tiphel',
  m:'Poel', l:'Palpel', L:'Ithpalpel', O:'Ithpolel', G:'Ittaphal'};
const HEB_CONJ  = {p:'Perfect', q:'Sequential Perfect', i:'Imperfect', w:'Sequential Imperfect',
  h:'Cohortative', j:'Jussive', v:'Imperative', r:'Participle (active)', s:'Participle (passive)',
  a:'Infinitive Absolute', c:'Infinitive Construct'};
const HEB_POS = {
  A:{a:'Adjective', c:'Cardinal Number', g:'Gentilic Adjective', o:'Ordinal Number'},
  N:{c:'Noun', g:'Gentilic Noun', p:'Proper Noun', x:'Noun'},
  P:{d:'Demonstrative Pronoun', f:'Indefinite Pronoun', i:'Interrogative Pronoun', p:'Personal Pronoun', r:'Relative Pronoun'},
  S:{d:'Directional He', h:'Paragogic He', n:'Paragogic Nun', p:'Pronominal Suffix'},
  T:{a:'Affirmation Particle', d:'Definite Article', e:'Exhortation Particle', i:'Interrogative Particle',
     j:'Interjection', m:'Demonstrative Particle', n:'Negative Particle', o:'Direct Object Marker', r:'Relative Particle'},
};
const HEB_SIMPLE = {C:'Conjunction', D:'Adverb', R:'Preposition', V:'Verb'};
// person/gender/number (pronouns, suffixes, finite verbs) or gender/number/state
function hebFeatures(s){
  if(/^[123x]/.test(s)) return [HEB_PERSON[s[0]], HEB_GEN[s[1]], HEB_NUM[s[2]]];
  return [HEB_GEN[s[0]], HEB_NUM[s[1]], HEB_STATE[s[2]]];
}
function decodeHebrewSeg(seg, aramaic){
  const pos = seg[0];
  let name, bits = [];
  if(pos === 'V'){
    name = 'Verb';
    bits = [(aramaic ? ARAM_STEM : HEB_STEM)[seg[1]], HEB_CONJ[seg[2]], ...hebFeatures(seg.slice(3))];
  } else if(HEB_POS[pos]){
    name = HEB_POS[pos][seg[1]] || HEB_POS[pos].a || pos;
    bits = hebFeatures(seg.slice(2));
  } else {
    name = HEB_SIMPLE[pos] || seg;
    if(pos === 'R' && seg[1] === 'd') name += ' (with article)';
  }
  bits = bits.filter(Boolean);
  return name + (bits.length ? ' · ' + bits.join(', ') : '');
}
function decodeHebrewMorph(m){
  if(!m) return '';
  const aramaic = m[0] === 'A';
  const out = m.slice(1).split('/').map(seg=> decodeHebrewSeg(seg, aramaic)).join(' + ');
  return aramaic ? out + ' (Aramaic)' : out;
}

/* ---------- word display ---------- */
// Which tagged text a book group has (the deuterocanonical books have none).
export const ORIGINAL_LANG = { ot: 'hbo', nt: 'grc' };
// dist/ words -> the field names the renderers use (g surface, s Strong's, m morph, gl gloss, t in context)
export const legacyWord = w=> ({ g: w.surface, s: w.strong, m: w.morph, gl: w.gloss, t: w.translation || '' });
// Hebrew: drop cantillation accents, meteg, paseq and sof pasuq (keep vowel points and maqaf).
const HEB_MARKS = /[֑-ֽ֯׀׃]/g;
export function stripCantillation(s){ return (s||'').replace(HEB_MARKS, ''); }
// Surface form of a tagged word; OSHB words mark morpheme boundaries with "/".
export function displayWord(w, hebrew){
  return hebrew ? stripCantillation(w.g.replace(/\//g, '')) : w.g;
}
// Toggle/tab labels for the original-language line.
export function langLabels(hebrew){
  return hebrew ? { name:'Hebrew', symbol:'א' } : { name:'Greek', symbol:'Ω' };
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
  let entry = null;
  const lang = strongs[0].toUpperCase() === 'H' ? 'hbo' : strongs[0].toUpperCase() === 'G' ? 'grc' : null;
  try{ if(lang) entry = await lib.lexicon(lang, strongs); }catch(e){ /* treated as no entry */ }
  if(!entry){
    el.lexPop.innerHTML = '<div class="empty-state">No lexicon entry for '+strongs+'.</div>';
    return;
  }
  const hebrew = strongs[0] === 'H';
  el.lexPop.innerHTML =
    '<div class="lex-head"><div>'+
    (hebrew ? '<div class="lex-greek hebrew" dir="rtl">'+escapeHtml(stripCantillation(entry.lemma))+'</div>'
            : '<div class="lex-greek">'+escapeHtml(entry.lemma)+'</div>')+
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

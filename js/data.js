/* Library data: books index, per-book JSON, lexicon, and the live NASB proxy. */

export let INDEX = null;
export const bookCache = {};
let lexicon = null, lexiconPromise = null;

async function fetchJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error('Failed to load '+path);
  return res.json();
}
export async function loadIndex(){
  INDEX = await fetchJSON('data/books-index.json');
  return INDEX;
}
export function loadBook(id){
  if(bookCache[id]) return Promise.resolve(bookCache[id]);
  return fetchJSON('data/'+id+'.json').then(d=>{ bookCache[id]=d; return d; });
}
export function loadLexicon(){
  if(lexicon) return Promise.resolve(lexicon);
  if(!lexiconPromise) lexiconPromise = fetchJSON('data/lexicon.json').then(d=>{ lexicon=d; return d; });
  return lexiconPromise;
}
export function bookMeta(id){ return INDEX.books.find(b=>b.id===id); }
export function isOT(id){ return INDEX.otBookIds.includes(id); }

/* ---------- NASB (live, via a Cloudflare Worker proxy in front of api.bible) ----------
   The proxy holds the api.bible key server-side, so nothing secret ever reaches
   this file or this browser. Leaving proxyUrl empty simply hides the NASB
   option, so the rest of the app works fine without it. */
const NASB_CONFIG = {
  proxyUrl: 'https://berea.tommymcmichen-0ac.workers.dev/',
  bibleId: 'b8ee27bcd1cae43a-01'
};
export function nasbAvailable(){ return !!(NASB_CONFIG.proxyUrl && NASB_CONFIG.bibleId); }

const USFM_ID = {
  gen:'GEN', exod:'EXO', lev:'LEV', num:'NUM', deut:'DEU', josh:'JOS', judg:'JDG', ruth:'RUT',
  '1sam':'1SA', '2sam':'2SA', '1kgs':'1KI', '2kgs':'2KI', '1chr':'1CH', '2chr':'2CH', ezra:'EZR',
  neh:'NEH', esth:'EST', job:'JOB', ps:'PSA', prov:'PRO', eccl:'ECC', song:'SNG', isa:'ISA',
  jer:'JER', lam:'LAM', ezek:'EZK', dan:'DAN', hos:'HOS', joel:'JOL', amos:'AMO', obad:'OBA',
  jonah:'JON', mic:'MIC', nah:'NAM', hab:'HAB', zeph:'ZEP', hag:'HAG', zech:'ZEC', mal:'MAL',
  matt:'MAT', mark:'MRK', luke:'LUK', john:'JHN', acts:'ACT', rom:'ROM',
  '1cor':'1CO', '2cor':'2CO', gal:'GAL', eph:'EPH', phil:'PHP', col:'COL',
  '1thess':'1TH', '2thess':'2TH', '1tim':'1TI', '2tim':'2TI', titus:'TIT',
  phlm:'PHM', heb:'HEB', jas:'JAS', '1pet':'1PE', '2pet':'2PE',
  '1jn':'1JN', '2jn':'2JN', '3jn':'3JN', jude:'JUD', rev:'REV'
};
// Some translations (INDEX.ntOnlyTranslations, e.g. YLT) have no OT text.
export function translationAvailable(code, bookId){
  return !(isOT(bookId) && (INDEX.ntOnlyTranslations || []).includes(code));
}
export function translationCodes(bookId){
  const codes = Object.keys(INDEX.translations).filter(c=> translationAvailable(c, bookId));
  if(nasbAvailable()) codes.push('NASB');
  return codes;
}
// The translation actually shown for a book: the viewer's pick, or KJV where it has no text.
// (The pick itself is kept, so e.g. YLT comes back on returning to the NT.)
export function effectiveTranslation(code, bookId){
  return translationAvailable(code, bookId) ? code : 'KJV';
}
export function translationName(code){
  return code === 'NASB' ? 'New American Standard Bible (1995, live)' : INDEX.translations[code];
}

const nasbChapterCache = {}; // "bookId.chapter" -> Promise<{verse:text}>
export async function ensureNasbChapter(bookId, chapter){
  if(!nasbAvailable()) throw new Error('NASB proxy not configured');
  const key = bookId + '.' + chapter;
  if(nasbChapterCache[key]) return nasbChapterCache[key];
  const promise = (async ()=>{
    const meta = bookMeta(bookId);
    const count = (meta.verseCounts && meta.verseCounts[String(chapter)]) || 0;
    const usfm = USFM_ID[bookId];
    const verses = {};
    const nums = []; for(let v=1; v<=count; v++) nums.push(v);
    const batchSize = 8;
    for(let i=0; i<nums.length; i+=batchSize){
      const batch = nums.slice(i, i+batchSize);
      await Promise.all(batch.map(async v=>{
        const vid = usfm + '.' + chapter + '.' + v;
        const url = NASB_CONFIG.proxyUrl.replace(/\/$/,'') + '/v1/bibles/' + encodeURIComponent(NASB_CONFIG.bibleId) +
          '/verses/' + encodeURIComponent(vid) +
          '?content-type=text&include-verse-numbers=false&include-notes=false&include-titles=false&include-chapter-numbers=false';
        const res = await fetch(url);
        if(!res.ok) throw new Error('NASB request failed (' + res.status + ')');
        const data = await res.json();
        let text = (data && data.data && data.data.content) || '';
        text = text.replace(/\s+/g, ' ').trim();
        if(text) verses[String(v)] = text;
      }));
    }
    const book = bookCache[bookId];
    if(book){
      book.translations.NASB = book.translations.NASB || {};
      book.translations.NASB[String(chapter)] = verses;
    }
    return verses;
  })();
  nasbChapterCache[key] = promise;
  promise.catch(()=>{ delete nasbChapterCache[key]; }); // allow retry after failure
  return promise;
}

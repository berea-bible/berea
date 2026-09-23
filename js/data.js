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

/* ---------- NASB (live, via a Cloudflare Worker proxy in front of api.bible) ----------
   The proxy holds the api.bible key server-side, so nothing secret ever reaches
   this file or this browser. Fill these in once the Worker is deployed —
   see cloudflare-worker/ and the README for setup. Leaving proxyUrl empty simply
   hides the NASB option, so the rest of the app works fine without it. */
const NASB_CONFIG = {
  proxyUrl: 'https://berea.tommymcmichen-0ac.workers.dev/',
  bibleId: 'b8ee27bcd1cae43a-01'
};
export function nasbAvailable(){ return !!(NASB_CONFIG.proxyUrl && NASB_CONFIG.bibleId); }

const USFM_ID = {
  matt:'MAT', mark:'MRK', luke:'LUK', john:'JHN', acts:'ACT', rom:'ROM',
  '1cor':'1CO', '2cor':'2CO', gal:'GAL', eph:'EPH', phil:'PHP', col:'COL',
  '1thess':'1TH', '2thess':'2TH', '1tim':'1TI', '2tim':'2TI', titus:'TIT',
  phlm:'PHM', heb:'HEB', jas:'JAS', '1pet':'1PE', '2pet':'2PE',
  '1jn':'1JN', '2jn':'2JN', '3jn':'3JN', jude:'JUD', rev:'REV'
};
export function translationCodes(){
  const codes = Object.keys(INDEX.translations);
  if(nasbAvailable()) codes.push('NASB');
  return codes;
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

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
// api.bible terms §7: cite the source wherever its text is shown and link to full copyright info.
export const NASB_NOTICE_HTML = 'NASB &copy; 1995 The Lockman Foundation. All rights reserved. ' +
  'Text via <a href="https://api.bible/" target="_blank" rel="noopener">API.Bible</a> &middot; ' +
  '<a href="copyright.html#nasb" target="_blank" rel="noopener">Copyright</a>';
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

/* Keep api.bible traffic low: one request per chapter (never per verse), nothing
   prefetched, and fetched chapters cached in IndexedDB. Per the api.bible agreement,
   cached text is refreshed after 30 days: expired entries are dropped when read and
   swept at boot (purgeExpiredNasb). Any storage failure falls back to memory + network. */
const NASB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const nasbChapterCache = {}; // "bookId.chapter" -> Promise<{verse:text}>

let nasbDbPromise = null;
function nasbDb(){
  if(!nasbDbPromise) nasbDbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open('berea-cache', 1);
    req.onupgradeneeded = ()=> req.result.createObjectStore('nasb');
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return nasbDbPromise;
}
// Run one request against the "nasb" store; resolves null on any storage failure.
async function nasbStore(mode, fn){
  try{
    const db = await nasbDb();
    return await new Promise((resolve, reject)=>{
      const req = fn(db.transaction('nasb', mode).objectStore('nasb'));
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }catch(e){ return null; }
}
const nasbKey = (bookId, chapter)=> NASB_CONFIG.bibleId + ':' + bookId + '.' + chapter;
const nasbFresh = entry=> entry && Date.now() - entry.fetchedAt < NASB_TTL_MS;

async function readStoredNasb(bookId, chapter){
  const key = nasbKey(bookId, chapter);
  const entry = await nasbStore('readonly', s=> s.get(key));
  if(!entry) return null;
  if(!nasbFresh(entry)){ nasbStore('readwrite', s=> s.delete(key)); return null; }
  return entry.verses;
}
export async function purgeExpiredNasb(){
  if(!nasbAvailable()) return;
  try{
    const db = await nasbDb();
    await new Promise((resolve, reject)=>{
      const tx = db.transaction('nasb', 'readwrite');
      const req = tx.objectStore('nasb').openCursor();
      req.onsuccess = ()=>{
        const cur = req.result;
        if(cur){ if(!nasbFresh(cur.value)) cur.delete(); cur.continue(); }
      };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = ()=> reject(tx.error);
    });
  }catch(e){ /* storage unavailable: nothing cached to purge */ }
}

function rememberNasb(bookId, chapter, verses){
  const book = bookCache[bookId];
  if(book){
    book.translations.NASB = book.translations.NASB || {};
    book.translations.NASB[String(chapter)] = verses;
  }
}
// api.bible "json" chapter content: nested para/char tags whose text nodes carry attrs.verseId ("JHN.3.16").
// Poetry lines are separate paras with no trailing space, so a space is added at each para boundary.
function parseNasbChapter(content){
  const verses = {};
  let last = null;
  (function walk(node){
    if(Array.isArray(node)){ node.forEach(walk); return; }
    if(!node) return;
    const vid = node.attrs && node.attrs.verseId;
    if(node.type === 'text' && vid){
      last = vid.split('.').pop();
      verses[last] = (verses[last] || '') + node.text;
    }
    if(node.items) walk(node.items);
    if(node.name === 'para' && last) verses[last] += ' ';
  })(content);
  Object.keys(verses).forEach(v=>{ verses[v] = verses[v].replace(/\s+/g, ' ').trim(); });
  return verses;
}

// Local copy only (memory or a fresh IndexedDB entry) — never hits the network.
export async function getCachedNasbChapter(bookId, chapter){
  if(!nasbAvailable()) return null;
  const book = bookCache[bookId];
  const mem = book && book.translations.NASB && book.translations.NASB[String(chapter)];
  if(mem) return mem;
  const verses = await readStoredNasb(bookId, chapter);
  if(verses) rememberNasb(bookId, chapter, verses);
  return verses;
}

export async function ensureNasbChapter(bookId, chapter){
  if(!nasbAvailable()) throw new Error('NASB proxy not configured');
  const key = bookId + '.' + chapter;
  if(nasbChapterCache[key]) return nasbChapterCache[key];
  const promise = (async ()=>{
    const cached = await getCachedNasbChapter(bookId, chapter);
    if(cached) return cached;
    const url = NASB_CONFIG.proxyUrl.replace(/\/$/,'') + '/v1/bibles/' + encodeURIComponent(NASB_CONFIG.bibleId) +
      '/chapters/' + encodeURIComponent(USFM_ID[bookId] + '.' + chapter) +
      '?content-type=json&include-notes=false&include-titles=false&include-chapter-numbers=false' +
      '&include-verse-numbers=false&include-verse-spans=false';
    const res = await fetch(url);
    if(!res.ok) throw new Error('NASB request failed (' + res.status + ')');
    const data = await res.json();
    const verses = parseNasbChapter(data && data.data && data.data.content);
    if(!Object.keys(verses).length) throw new Error('NASB returned no text');
    rememberNasb(bookId, chapter, verses);
    nasbStore('readwrite', s=> s.put({ verses, fetchedAt: Date.now() }, nasbKey(bookId, chapter)));
    return verses;
  })();
  nasbChapterCache[key] = promise;
  promise.catch(()=>{ delete nasbChapterCache[key]; }); // allow retry after failure
  return promise;
}

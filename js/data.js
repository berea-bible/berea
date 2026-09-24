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
const nasbTokens = {};       // "bookId.chapter" -> fumsToken from the api.bible response

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
  // no fumsToken = cached before FUMS reporting existed; refetch so views can be reported
  if(!nasbFresh(entry) || !entry.fumsToken){ nasbStore('readwrite', s=> s.delete(key)); return null; }
  return entry;
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

function rememberNasb(bookId, chapter, verses, fumsToken){
  nasbTokens[bookId + '.' + chapter] = fumsToken;
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
  const entry = await readStoredNasb(bookId, chapter);
  if(!entry) return null;
  rememberNasb(bookId, chapter, entry.verses, entry.fumsToken);
  return entry.verses;
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
    const fumsToken = (data.meta && data.meta.fumsToken) || '';
    rememberNasb(bookId, chapter, verses, fumsToken);
    nasbStore('readwrite', s=> s.put({ verses, fumsToken, fetchedAt: Date.now() }, nasbKey(bookId, chapter)));
    return verses;
  })();
  nasbChapterCache[key] = promise;
  promise.catch(()=>{ delete nasbChapterCache[key]; }); // allow retry after failure
  return promise;
}

/* ---------- FUMS (api.bible Fair Use Management System, terms §14) ----------
   Required for webapps: every time NASB text is displayed, report the fumsToken from the
   response that supplied it (including text shown from the IndexedDB cache). This speaks
   the documented FUMS v3 HTTP protocol directly instead of loading api.bible's tracker
   script (pkg.api.bible/fumsV3.min.js), keeping the app free of third-party JS. Only
   anonymous ids are sent: a random device id (localStorage) and session id (sessionStorage),
   under the same keys the official tracker uses. Reports made offline are queued. */
const FUMS_URL = 'https://fums.api.bible/f3';
function fumsId(){
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  return Array.from(crypto.getRandomValues(new Uint8Array(21)), b=> chars[b & 63]).join('');
}
function fumsStoredId(storage, key){
  try{
    let id = window[storage].getItem(key);
    if(!id){ id = fumsId(); window[storage].setItem(key, id); }
    return id;
  }catch(e){ return fumsStoredId.fallback[key] = fumsStoredId.fallback[key] || fumsId(); }
}
fumsStoredId.fallback = {};
function fumsSend(url){ fetch(url, { mode:'no-cors', keepalive:true }).catch(()=>{}); }

export function reportNasbView(bookId, chapter){
  const token = nasbTokens[bookId + '.' + chapter];
  if(!token) return;
  let url = FUMS_URL + '?dId=' + fumsStoredId('localStorage', 'fums.dId') +
    '&sId=' + fumsStoredId('sessionStorage', 'fums.sId') + '&t=' + encodeURIComponent(token);
  if(navigator.onLine === false){
    try{ localStorage.setItem('fums.report.' + fumsId(), url + '&ts=' + Date.now()); }catch(e){}
    return;
  }
  fumsSend(url);
}
// Send any reports queued while offline (called at boot and when the browser comes back online).
export function flushFumsQueue(){
  try{
    Object.keys(localStorage).filter(k=> k.startsWith('fums.report.')).forEach(k=>{
      const url = localStorage.getItem(k);
      localStorage.removeItem(k);
      if(url) fumsSend(url);
    });
  }catch(e){}
}
window.addEventListener('online', flushFumsQueue);

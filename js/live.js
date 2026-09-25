/* Live translations: NASB, NIV and NKJV (api.bible) and ESV (api.esv.org), all fetched per chapter
   through the Cloudflare Worker, which holds the API keys server-side. Book arguments are native
   book codes. */
import { legacyId, bookName } from './data.js';

/* ---------- api.bible translations (NASB, NIV, NKJV), via the Cloudflare Worker proxy ----------
   The proxy holds the api.bible key server-side, so nothing secret ever reaches this file or this
   browser. Leaving proxyUrl empty hides all of them; a translation with no bibleId is hidden too.
   Bible ids are from the plan's /v1/bibles list. Each needs, per the api.bible terms: its copyright
   notice wherever its text is shown (§7), and a FUMS report for every display (§14). */
const PROXY_URL = 'https://berea.tommymcmichen-0ac.workers.dev/';
const API_BIBLE = {
  NASB: { bibleId: 'b8ee27bcd1cae43a-01',
    notice: 'NASB &copy; 1995 The Lockman Foundation. All rights reserved.' },
  NIV:  { bibleId: '78a9f6124f344018-01',
    notice: 'The Holy Bible, New International Version&reg; NIV&reg; Copyright &copy; 1973, 1978, 1984, 2011 by Biblica, Inc.&reg; ' +
            'Used by permission. All rights reserved worldwide.' },
  NKJV: { bibleId: '63097d2a0a2f7db3-01',
    notice: 'New King James Version&reg;, Copyright &copy; 1982, Thomas Nelson. Used by permission. All rights reserved.' },
};
const apiBibleNotice = code=> API_BIBLE[code].notice + ' ' +
  'Text via <a href="https://api.bible/" target="_blank" rel="noopener">API.Bible</a> &middot; ' +
  '<a href="copyright.html#' + code.toLowerCase() + '" target="_blank" rel="noopener">Copyright</a>';
export const NASB_NOTICE_HTML = apiBibleNotice('NASB');
const apiBibleAvailable = code=> !!(PROXY_URL && API_BIBLE[code].bibleId);
export function nasbAvailable(){ return apiBibleAvailable('NASB'); }

/* ---------- ESV (live, via the same Worker's /esv/* route in front of api.esv.org) ----------
   The Worker adds the api.esv.org token server-side. Empty proxyUrl hides the ESV option. */
const ESV_CONFIG = { proxyUrl: PROXY_URL };   // same Worker as the api.bible translations
export function esvAvailable(){ return !!ESV_CONFIG.proxyUrl; }
// ESV terms: identify the text as ESV and link to www.esv.org on every page that shows it.
export const ESV_NOTICE_HTML = '<a href="https://www.esv.org" target="_blank" rel="noopener">ESV</a>&reg; text used by permission. ' +
  'Copyright &copy; 2001 by Crossway, a publishing ministry of Good News Publishers. All rights reserved. &middot; ' +
  '<a href="copyright.html#esv" target="_blank" rel="noopener">Copyright</a>';

/* Keep api.bible traffic low: one request per chapter (never per verse), nothing
   prefetched, and fetched chapters cached in IndexedDB. Per the api.bible agreement,
   cached text is refreshed after 30 days: expired entries are dropped when read and
   swept at boot (purgeExpiredNasb). Any storage failure falls back to memory + network.
   One store holds every api.bible translation (keys start with the bible id); it keeps its
   pre-NIV name, "nasb", so chapters cached before stay valid. */
const API_BIBLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const chapterRequests = {}; // "TR:BOOK.chapter" -> Promise<{verse:text}>
const fumsTokens = {};      // "TR:BOOK.chapter" -> fumsToken from the api.bible response
const chapterMem = {};      // "TR:BOOK.chapter" -> {verse: text}, this session
const memKey = (tr, code, chapter)=> tr + ':' + code + '.' + chapter;
// Live functions take book codes (USFM, e.g. 'JHN'). Stored cache keys keep the pre-v2 app id
// ('john'), so chapters cached before v2 stay valid.
const cacheId = code=> legacyId(code) || code;

let dbPromise = null;
function cacheDb(){
  if(!dbPromise) dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open('berea-cache', 1);
    req.onupgradeneeded = ()=> req.result.createObjectStore('nasb');
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
  return dbPromise;
}
// Run one request against the store; resolves null on any storage failure.
async function cacheStore(mode, fn){
  try{
    const db = await cacheDb();
    return await new Promise((resolve, reject)=>{
      const req = fn(db.transaction('nasb', mode).objectStore('nasb'));
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }catch(e){ return null; }
}
const storeKey = (tr, code, chapter)=> API_BIBLE[tr].bibleId + ':' + cacheId(code) + '.' + chapter;
const fresh = entry=> entry && Date.now() - entry.fetchedAt < API_BIBLE_TTL_MS;

async function readStored(tr, code, chapter){
  const key = storeKey(tr, code, chapter);
  const entry = await cacheStore('readonly', s=> s.get(key));
  if(!entry) return null;
  // no fumsToken = cached before FUMS reporting existed; refetch so views can be reported
  if(!fresh(entry) || !entry.fumsToken){ cacheStore('readwrite', s=> s.delete(key)); return null; }
  return entry;
}
export async function purgeExpiredNasb(){
  if(!PROXY_URL) return;
  try{
    const db = await cacheDb();
    await new Promise((resolve, reject)=>{
      const tx = db.transaction('nasb', 'readwrite');
      const req = tx.objectStore('nasb').openCursor();
      req.onsuccess = ()=>{
        const cur = req.result;
        if(cur){ if(!fresh(cur.value)) cur.delete(); cur.continue(); }
      };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = ()=> reject(tx.error);
    });
  }catch(e){ /* storage unavailable: nothing cached to purge */ }
}

function remember(tr, code, chapter, verses, fumsToken){
  fumsTokens[memKey(tr, code, chapter)] = fumsToken;
  chapterMem[memKey(tr, code, chapter)] = verses;
}
// api.bible "json" chapter content: nested para/char tags whose text nodes carry attrs.verseId ("JHN.3.16").
// Poetry lines are separate paras with no trailing space, so a space is added at each para boundary.
function parseApiBibleChapter(content){
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
async function getCachedApiBibleChapter(tr, code, chapter){
  if(!apiBibleAvailable(tr)) return null;
  const mem = chapterMem[memKey(tr, code, chapter)];
  if(mem) return mem;
  const entry = await readStored(tr, code, chapter);
  if(!entry) return null;
  remember(tr, code, chapter, entry.verses, entry.fumsToken);
  return entry.verses;
}

async function ensureApiBibleChapter(tr, code, chapter){
  if(!apiBibleAvailable(tr)) throw new Error(tr + ' proxy not configured');
  const key = memKey(tr, code, chapter);
  if(chapterRequests[key]) return chapterRequests[key];
  const promise = (async ()=>{
    const cached = await getCachedApiBibleChapter(tr, code, chapter);
    if(cached) return cached;
    const url = PROXY_URL.replace(/\/$/,'') + '/v1/bibles/' + encodeURIComponent(API_BIBLE[tr].bibleId) +
      '/chapters/' + encodeURIComponent(code + '.' + chapter) +
      '?content-type=json&include-notes=false&include-titles=false&include-chapter-numbers=false' +
      '&include-verse-numbers=false&include-verse-spans=false';
    const res = await fetch(url);
    if(!res.ok) throw new Error(tr + ' request failed (' + res.status + ')');
    const data = await res.json();
    const verses = parseApiBibleChapter(data && data.data && data.data.content);
    if(!Object.keys(verses).length) throw new Error(tr + ' returned no text');
    const fumsToken = (data.meta && data.meta.fumsToken) || '';
    remember(tr, code, chapter, verses, fumsToken);
    cacheStore('readwrite', s=> s.put({ verses, fumsToken, fetchedAt: Date.now() }, storeKey(tr, code, chapter)));
    return verses;
  })();
  chapterRequests[key] = promise;
  promise.catch(()=>{ delete chapterRequests[key]; }); // allow retry after failure
  return promise;
}
// The NASB entry points, as before (the tests and older callers use them).
export const getCachedNasbChapter = (code, chapter)=> getCachedApiBibleChapter('NASB', code, chapter);
export const ensureNasbChapter = (code, chapter)=> ensureApiBibleChapter('NASB', code, chapter);

/* ---------- FUMS (api.bible Fair Use Management System, terms §14) ----------
   Required for webapps: every time api.bible text (NASB, NIV, NKJV) is displayed, report the fumsToken from the
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

function reportApiBibleView(tr, code, chapter){
  const token = fumsTokens[memKey(tr, code, chapter)];
  if(!token) return;
  let url = FUMS_URL + '?dId=' + fumsStoredId('localStorage', 'fums.dId') +
    '&sId=' + fumsStoredId('sessionStorage', 'fums.sId') + '&t=' + encodeURIComponent(token);
  if(navigator.onLine === false){
    try{ localStorage.setItem('fums.report.' + fumsId(), url + '&ts=' + Date.now()); }catch(e){}
    return;
  }
  fumsSend(url);
}
export const reportNasbView = (code, chapter)=> reportApiBibleView('NASB', code, chapter);
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

/* ---------- ESV fetch + cache ----------
   One /v3/passage/text/ request per chapter; nothing prefetched (the Compare tab offers a Load
   button, like NASB). ESV API terms: at most 5,000 queries/day, 1,000/hour, 60/minute;
   non-commercial use only. */
const esvChapterCache = {};   // "bookId.chapter" -> Promise<{verse:text}>
const ESV_CACHE_KEY = 'verbum-esv-cache';
// HARD LIMIT from the ESV API terms ("You can cache up to 500 verses"), not a performance knob:
// the cache is capped by total VERSES across all chapters, evicting whole oldest chapters.
const ESV_CACHE_MAX_VERSES = 500;

function readEsvCache(){
  try{
    const c = JSON.parse(localStorage.getItem(ESV_CACHE_KEY) || 'null');
    if(c && Array.isArray(c.order) && c.chapters) return c;
  }catch(e){}
  return { order: [], chapters: {} };
}
// In-memory copy (session) mirrors the capped cache, so we never hold more than the limit either.
const esvMem = readEsvCache();
function writeEsvCache(){ try{ localStorage.setItem(ESV_CACHE_KEY, JSON.stringify(esvMem)); }catch(e){} }
export function esvCacheVerseCount(){ return esvMem.order.reduce((n, k)=> n + (esvMem.chapters[k] ? esvMem.chapters[k].n : 0), 0); }

function forgetEsv(key){
  delete esvMem.chapters[key];
  esvMem.order = esvMem.order.filter(k=> k !== key);
}
function rememberEsv(bookId, chapter, verses){
  const key = cacheId(bookId) + '.' + chapter;
  if(esvMem.chapters[key]) esvMem.order = esvMem.order.filter(k=> k !== key);
  esvMem.chapters[key] = { verses, n: Object.keys(verses).length };
  esvMem.order.push(key);
  while(esvCacheVerseCount() > ESV_CACHE_MAX_VERSES && esvMem.order.length > 1) forgetEsv(esvMem.order[0]);
  writeEsvCache();
}

// api.esv.org text: one string with inline "[N]" verse markers
function parseEsvChapter(text){
  const parts = String(text || '').split(/\[(\d+)\]/), verses = {};
  for(let i = 1; i < parts.length; i += 2){
    const t = parts[i + 1].replace(/\s+/g, ' ').trim();
    if(t) verses[parts[i]] = t;
  }
  return verses;
}

// Local copy only (memory / capped localStorage cache): never hits the network.
export function getCachedEsvChapter(bookId, chapter){
  if(!esvAvailable()) return null;
  const hit = esvMem.chapters[cacheId(bookId) + '.' + chapter];
  return hit ? hit.verses : null;
}

export async function ensureEsvChapter(bookId, chapter){
  if(!esvAvailable()) throw new Error('ESV proxy not configured');
  const key = bookId + '.' + chapter;
  if(esvChapterCache[key]) return esvChapterCache[key];
  const promise = (async ()=>{
    const cached = getCachedEsvChapter(bookId, chapter);
    if(cached) return cached;
    const params = new URLSearchParams({
      q: bookName(bookId) + ' ' + chapter,
      'include-verse-numbers': 'true', 'include-first-verse-numbers': 'true',
      'include-footnotes': 'false', 'include-headings': 'false', 'include-short-copyright': 'false',
      'include-passage-references': 'false', 'include-selahs': 'true'
    });
    const res = await fetch(ESV_CONFIG.proxyUrl.replace(/\/$/, '') + '/esv/v3/passage/text/?' + params);
    if(!res.ok) throw new Error('ESV request failed (' + res.status + ')');
    const data = await res.json();
    const verses = parseEsvChapter(data && data.passages && data.passages[0]);
    if(!Object.keys(verses).length) throw new Error('ESV returned no text');
    rememberEsv(bookId, chapter, verses);
    return verses;
  })();
  esvChapterCache[key] = promise;
  promise.then(()=>{ delete esvChapterCache[key]; }, ()=>{ delete esvChapterCache[key]; });   // the capped cache is the only store
  return promise;
}

/* ---------- live translations: one table for the reader and the Compare tab ---------- */
export const liveAvailable = code=> !!(LIVE_TRANSLATIONS[code] && LIVE_TRANSLATIONS[code].available());
const apiBibleEntry = tr=> ({
  available: ()=> apiBibleAvailable(tr),
  ensure: (code, chapter)=> ensureApiBibleChapter(tr, code, chapter),
  getCached: (code, chapter)=> getCachedApiBibleChapter(tr, code, chapter),
  notice: apiBibleNotice(tr),
  report: (code, chapter)=> reportApiBibleView(tr, code, chapter),   // api.bible FUMS
  source: 'api.bible',
});
export const LIVE_TRANSLATIONS = {
  NASB: apiBibleEntry('NASB'),
  NIV: apiBibleEntry('NIV'),
  NKJV: apiBibleEntry('NKJV'),
  ESV:  { available: esvAvailable, ensure: ensureEsvChapter, getCached: getCachedEsvChapter,
          notice: ESV_NOTICE_HTML, report: null, source: 'api.esv.org' },
};

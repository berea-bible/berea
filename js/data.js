/* Library data: the v2 runtime (dist/, via berea-data.js: catalog, canon profiles, book lists) and the
   live NASB/ESV proxy. Book ids are native book codes (USFM, e.g. 'JHN'); `legacyId()` gives the
   pre-v2 app id ('john'), used only to migrate saved prefs and to keep live-text cache keys stable. */
import { createData } from './berea-data.js';

/* ---------- v2: dist/ ---------- */
export const lib = createData({ base: 'dist/' });
export let CAT = null;
export async function loadCatalog(){ CAT = await lib.catalog(); return CAT; }
export const bookName = code=> CAT.byCode[code].name;
export const bookGroup = code=> CAT.byCode[code].group;
// pre-v2 app ids ('john', 'addesth'): saved prefs, the NASB cache keys, and the data/ bridge
export const legacyId = code=> (CAT.byCode[code] || {}).legacy;
export const codeFromLegacy = id=> (CAT.books.find(b=> b.legacy === id) || {}).code;
export const hasBook = (tr, code, profile)=>{
  const b = CAT.translations[tr] && CAT.translations[tr].books[code];
  return !!b && (!profile || b.nav.includes(profile));
};
// A verse's pivots that lie inside a canon profile (citations elsewhere aren't shown under it).
export const pivotsIn = (vids, profile)=>{
  const allowed = new Set(CAT.profiles[profile]);
  return vids.filter(v=> allowed.has(CAT.byOrd[Math.floor(v / 2 ** 20)].code));
};
// Where a native book falls in a canon profile's order (by the first of its pivot books there).
function profilePos(tr, code, profile){
  const order = CAT.profiles[profile];
  const ps = CAT.translations[tr].books[code].pivots.map(p=> order.indexOf(p)).filter(i=> i >= 0);
  return ps.length ? Math.min(...ps) : Infinity;
}
/* The book list for a pick: the translation's own books, plus the KJV's for any part of the Bible it
   doesn't have (YLT in the OT, the deuterocanonical books for ASV/NASB/ESV, Tobit for the DRA), each
   tagged with the translation actually shown there. */
export async function navEntries(pick, profile){
  const own = (await lib.navBooks(pick, profile)).map(b=> ({ ...b, tr: pick }));
  const covered = new Set(own.flatMap(b=> CAT.translations[pick].books[b.code].pivots));
  const fallback = pick === 'KJV' ? [] : (await lib.navBooks('KJV', profile))
    .filter(b=> !CAT.translations.KJV.books[b.code].pivots.some(p=> covered.has(p))).map(b=> ({ ...b, tr: 'KJV' }));
  const allowed = new Set(CAT.profiles[profile]);
  return [...own, ...fallback]
    .map(b=> ({ ...b, fathers: CAT.translations[b.tr].books[b.code].pivots.filter(p=> allowed.has(p))
                              .reduce((n, p)=> n + (CAT.commentary.fathers.verses[p] || 0), 0) }))
    .sort((a, b)=> profilePos(a.tr, a.code, profile) - profilePos(b.tr, b.code, profile));
}
// Translations with text for (part of) a native book, in display order; live ones only when configured.
export function translationsFor(tr, code){
  const want = new Set(CAT.translations[tr].books[code].pivots);
  return Object.keys(CAT.translations).filter(t=>{
    if(CAT.translations[t].live && !(LIVE_TRANSLATIONS[t] && LIVE_TRANSLATIONS[t].available())) return false;
    return Object.values(CAT.translations[t].books).some(b=> b.pivots.some(p=> want.has(p)));
  });
}

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

/* ---------- ESV (live, via the same Worker's /esv/* route in front of api.esv.org) ----------
   The Worker adds the api.esv.org token server-side. Empty proxyUrl hides the ESV option. */
const ESV_CONFIG = { proxyUrl: NASB_CONFIG.proxyUrl };   // same Worker as NASB
export function esvAvailable(){ return !!ESV_CONFIG.proxyUrl; }
// ESV terms: identify the text as ESV and link to www.esv.org on every page that shows it.
export const ESV_NOTICE_HTML = '<a href="https://www.esv.org" target="_blank" rel="noopener">ESV</a>&reg; text used by permission. ' +
  'Copyright &copy; 2001 by Crossway, a publishing ministry of Good News Publishers. All rights reserved. &middot; ' +
  '<a href="copyright.html#esv" target="_blank" rel="noopener">Copyright</a>';

export function translationName(code){ return CAT.translations[code].name; }

/* Keep api.bible traffic low: one request per chapter (never per verse), nothing
   prefetched, and fetched chapters cached in IndexedDB. Per the api.bible agreement,
   cached text is refreshed after 30 days: expired entries are dropped when read and
   swept at boot (purgeExpiredNasb). Any storage failure falls back to memory + network. */
const NASB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const nasbChapterCache = {}; // "BOOK.chapter" -> Promise<{verse:text}>
const nasbTokens = {};       // "BOOK.chapter" -> fumsToken from the api.bible response
const nasbMem = {};          // "BOOK.chapter" -> {verse: text}, this session
// Live functions take book codes (USFM, e.g. 'JHN'). Stored cache keys keep the pre-v2 app id
// ('john'), so chapters cached before v2 stay valid.
const cacheId = code=> legacyId(code) || code;

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
const nasbKey = (code, chapter)=> NASB_CONFIG.bibleId + ':' + cacheId(code) + '.' + chapter;
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
  nasbMem[bookId + '.' + chapter] = verses;
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
  const mem = nasbMem[bookId + '.' + chapter];
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
      '/chapters/' + encodeURIComponent(bookId + '.' + chapter) +
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
export const LIVE_TRANSLATIONS = {
  NASB: { available: nasbAvailable, ensure: ensureNasbChapter, getCached: getCachedNasbChapter,
          notice: NASB_NOTICE_HTML, report: reportNasbView },   // report = api.bible FUMS (NASB only)
  ESV:  { available: esvAvailable, ensure: ensureEsvChapter, getCached: getCachedEsvChapter,
          notice: ESV_NOTICE_HTML, report: null },
};

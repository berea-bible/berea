/* Library data: books index, per-book JSON, church-fathers quotes, lexicon, and the live NASB/ESV proxy. */

export let INDEX = null;
export const bookCache = {};

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
// Fetch a JSON file once per session (failures aren't cached, so they can be retried).
const fileCache = {};
function loadOnce(path){
  if(!fileCache[path]){
    fileCache[path] = fetchJSON(path);
    fileCache[path].catch(()=>{ delete fileCache[path]; });
  }
  return fileCache[path];
}

// Tagged Greek/Hebrew words ({ch: {v: [word]}}), kept out of the book file: loaded only when the
// original-language line is on or the Greek/Hebrew tab is opened.
export function loadOriginal(bookId){ return loadOnce('data/original/' + bookId + '.json'); }

/* ---------- church-fathers quotes ----------
   A book file's `fathers` index maps verse -> quote refs. A ref is an index into that chapter's
   quote file (data/fathers/<book>/<ch>.json), or "book/ch/i" for a quote stored with another
   chapter (each distinct quote is stored once). Bodies load only when the Fathers tab opens. */
export async function loadQuotes(bookId, chapter, refs){
  const loc = refs.map(r=>{
    if(typeof r === 'number') return [bookId + '/' + chapter, r];
    const cut = r.lastIndexOf('/');
    return [r.slice(0, cut), Number(r.slice(cut + 1))];
  });
  const paths = [...new Set(loc.map(l=> l[0]))];
  const files = await Promise.all(paths.map(p=> loadOnce('data/fathers/' + p + '.json')));
  const byPath = Object.fromEntries(paths.map((p, i)=> [p, files[i]]));
  return loc.map(([p, i])=> byPath[p][i]);
}

/* ---------- lexicon ----------
   data/lexicon/index-G.json / index-H.json: {id: [lemma, translit, gloss, pos]}, loaded on the first
   word click in that language; definitions in buckets of INDEX.lexiconBucketSize Strong's numbers
   (data/lexicon/G/<n>.json), each loaded when a word in its range is clicked. */
function lexiconKey(index, strongs){
  if(index[strongs]) return strongs;
  // extended Strong's (e.g. G2424G) falls back to the base number, zero-padded (Greek) or not (Hebrew)
  const m = /^([GH])0*(\d+)([A-Za-z]*)$/i.exec(strongs);
  if(!m) return null;
  const lang = m[1].toUpperCase();
  return [lang + m[2].padStart(4, '0') + m[3], lang + m[2] + m[3], lang + m[2].padStart(4, '0'), lang + m[2]]
    .find(k=> index[k]) || null;
}
export async function lookupLexicon(strongs){
  const lang = String(strongs)[0].toUpperCase();
  if(lang !== 'G' && lang !== 'H') return null;
  const index = await loadOnce('data/lexicon/index-' + lang + '.json');
  const key = lexiconKey(index, strongs);
  if(!key) return null;
  const [greek, translit, gloss, pos] = index[key];
  const bucket = Math.floor(Number(key.replace(/\D/g, '')) / (INDEX.lexiconBucketSize || 500));
  const defs = await loadOnce('data/lexicon/' + lang + '/' + bucket + '.json');
  return { id: key, greek, translit, gloss, pos, definition: defs[key] || '' };
}
export function bookMeta(id){ return INDEX.books.find(b=>b.id===id); }
export function isOT(id){ return INDEX.otBookIds.includes(id); }
// A book's chapter numbers. Usually 1..N, but not always: the Additions to Esther are 10-16 (KJV numbering).
export function chapterNumbers(id){
  return Object.keys(bookMeta(id).verseCounts).map(Number).sort((a, b)=> a - b);
}
export function isDeuterocanonical(id){ return (INDEX.deuterocanonicalBookIds || []).includes(id); }

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

const USFM_ID = {
  gen:'GEN', exod:'EXO', lev:'LEV', num:'NUM', deut:'DEU', josh:'JOS', judg:'JDG', ruth:'RUT',
  '1sam':'1SA', '2sam':'2SA', '1kgs':'1KI', '2kgs':'2KI', '1chr':'1CH', '2chr':'2CH', ezra:'EZR',
  neh:'NEH', esth:'EST', job:'JOB', ps:'PSA', prov:'PRO', eccl:'ECC', song:'SNG', isa:'ISA',
  jer:'JER', lam:'LAM', ezek:'EZK', dan:'DAN', hos:'HOS', joel:'JOL', amos:'AMO', obad:'OBA',
  jonah:'JON', mic:'MIC', nah:'NAM', hab:'HAB', zeph:'ZEP', hag:'HAG', zech:'ZEC', mal:'MAL',
  '1esd':'1ES', '2esd':'2ES', tob:'TOB', jdt:'JDT', addesth:'ESG', wis:'WIS', sir:'SIR', bar:'BAR',
  prazar:'S3Y', sus:'SUS', bel:'BEL', prman:'MAN', '1macc':'1MA', '2macc':'2MA',
  matt:'MAT', mark:'MRK', luke:'LUK', john:'JHN', acts:'ACT', rom:'ROM',
  '1cor':'1CO', '2cor':'2CO', gal:'GAL', eph:'EPH', phil:'PHP', col:'COL',
  '1thess':'1TH', '2thess':'2TH', '1tim':'1TI', '2tim':'2TI', titus:'TIT',
  phlm:'PHM', heb:'HEB', jas:'JAS', '1pet':'1PE', '2pet':'2PE',
  '1jn':'1JN', '2jn':'2JN', '3jn':'3JN', jude:'JUD', rev:'REV'
};
// Some translations (INDEX.ntOnlyTranslations, e.g. YLT) have no OT text. Deuterocanonical books list the
// translations that carry them (KJV, WEB and, for some books, DRA); NASB/ESV serve none of them.
export function translationAvailable(code, bookId){
  const meta = bookMeta(bookId);
  if(meta && meta.translations) return meta.translations.includes(code);
  return !(isOT(bookId) && (INDEX.ntOnlyTranslations || []).includes(code));
}
export function translationCodes(bookId){
  const codes = Object.keys(INDEX.translations).filter(c=> translationAvailable(c, bookId));
  if(nasbAvailable() && translationAvailable('NASB', bookId)) codes.push('NASB');
  if(esvAvailable() && translationAvailable('ESV', bookId)) codes.push('ESV');
  return codes;
}
// The translation actually shown for a book: the viewer's pick, or KJV where it has no text.
// (The pick itself is kept, so e.g. YLT comes back on returning to the NT.)
export function effectiveTranslation(code, bookId){
  return translationAvailable(code, bookId) ? code : 'KJV';
}
const LIVE_NAMES = { NASB: 'New American Standard Bible (1995)', ESV: 'English Standard Version (2016)' };
export function translationName(code){
  return LIVE_NAMES[code] || INDEX.translations[code];
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
  const [bookId, chapter] = key.split('.');
  const book = bookCache[bookId];
  if(book && book.translations.ESV) delete book.translations.ESV[chapter];
}
function rememberEsv(bookId, chapter, verses){
  const key = bookId + '.' + chapter;
  if(esvMem.chapters[key]) esvMem.order = esvMem.order.filter(k=> k !== key);
  esvMem.chapters[key] = { verses, n: Object.keys(verses).length };
  esvMem.order.push(key);
  while(esvCacheVerseCount() > ESV_CACHE_MAX_VERSES && esvMem.order.length > 1) forgetEsv(esvMem.order[0]);
  writeEsvCache();
  const book = bookCache[bookId];
  if(book){
    book.translations.ESV = book.translations.ESV || {};
    book.translations.ESV[String(chapter)] = verses;
  }
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
  const hit = esvMem.chapters[bookId + '.' + chapter];
  if(!hit) return null;
  const book = bookCache[bookId];
  if(book){ book.translations.ESV = book.translations.ESV || {}; book.translations.ESV[String(chapter)] = hit.verses; }
  return hit.verses;
}

export async function ensureEsvChapter(bookId, chapter){
  if(!esvAvailable()) throw new Error('ESV proxy not configured');
  const key = bookId + '.' + chapter;
  if(esvChapterCache[key]) return esvChapterCache[key];
  const promise = (async ()=>{
    const cached = getCachedEsvChapter(bookId, chapter);
    if(cached) return cached;
    const params = new URLSearchParams({
      q: bookMeta(bookId).name + ' ' + chapter,
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

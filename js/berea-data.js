/* v2 runtime data (dist/): every translation in its own verse numbering, linked through one shared
   verse ID. A vid packs a pivot verse (TVTMS Standard = KJV numbering; verse 0 = a psalm title):
   vid = ord * 2^20 + chapter * 2^10 + verse, with the book ordinals from catalog.json. Pivots are
   internal: everything returned here carries each translation's own book/chapter/verse.

   Plain ES module, no dependencies. createData() takes an optional loader, so the Node tests
   (tests/) read dist/ from disk with the same code the browser runs. See docs/v2-plan.md §6-§7. */

export function createData({ base = 'dist/', fetchJSON } = {}){
  const load = fetchJSON || (async path=>{
    const res = await fetch(base + path);
    if(!res.ok) throw new Error('Failed to load ' + base + path);
    return res.json();
  });
  // Each file is fetched once per session; failures aren't cached, so they can be retried.
  const files = {};
  function loadOnce(path){
    if(!files[path]){
      files[path] = load(path);
      files[path].catch(()=>{ delete files[path]; });
    }
    return files[path];
  }

  /* ---------- catalog, books, vids ---------- */
  let catalogPromise = null;
  function catalog(){
    if(!catalogPromise){
      catalogPromise = loadOnce('catalog.json').then(c=>{
        c.byCode = Object.fromEntries(c.books.map(b=> [b.code, b]));
        c.byOrd = Object.fromEntries(c.books.map(b=> [b.ord, b]));
        return c;
      });
      catalogPromise.catch(()=>{ catalogPromise = null; });
    }
    return catalogPromise;
  }
  const B = 2 ** 20, C = 2 ** 10;
  const encode = (cat, code, ch, v)=> cat.byCode[code].ord * B + ch * C + v;
  function decode(cat, vid){
    return { book: cat.byOrd[Math.floor(vid / B)].code, chapter: Math.floor(vid / C) % C, verse: vid % C };
  }

  // A translation's native book file, as rows [{chapter, verse, text, pivots: [vid]}].
  const parsed = {};
  async function bookRows(tr, code){
    const key = tr + '/' + code;
    if(!parsed[key]) parsed[key] = (async ()=>{
      const [cat, doc] = await Promise.all([catalog(), loadOnce('text/' + tr + '/' + code + '.json')]);
      return doc.ref.map((r, i)=>{
        const chapter = Math.floor(r / 1000), verse = r % 1000;
        return { book: code, chapter, verse, text: doc.text[i],
                 pivots: doc.pivot[i] || [encode(cat, code, chapter, verse)] };
      });
    })();
    parsed[key].catch(()=>{ delete parsed[key]; });
    return parsed[key];
  }
  const absentOf = tr=> loadOnce('text/' + tr + '/absent.json');

  // Pivot books a set of vids falls in.
  const pivotBooks = (cat, vids)=> [...new Set(vids.map(v=> decode(cat, v).book))];

  /* ---------- nav and chapters ---------- */
  // Native books a translation shows under a canon profile, in the profile's order.
  async function navBooks(tr, profile){
    const cat = await catalog();
    const order = cat.profiles[profile];
    const books = cat.translations[tr].books;
    const pos = code=> Math.min(...books[code].pivots.map(p=> order.includes(p) ? order.indexOf(p) : Infinity),
                                order.includes(code) ? order.indexOf(code) : Infinity);
    return Object.keys(books)
      .filter(code=> books[code].nav.includes(profile))
      .sort((a, b)=> pos(a) - pos(b))
      .map(code=> ({ code, name: cat.byCode[code].name, chapters: books[code].chapters }));
  }

  // A native verse is hidden only when every one of its pivots is outside the profile.
  function visibleIn(cat, profile){
    const allowed = new Set(cat.profiles[profile]);
    return row=> row.pivots.some(p=> allowed.has(decode(cat, p).book));
  }

  // The verses of one native chapter a profile shows: [{book, chapter, verse, text, pivots}].
  async function chapter(tr, code, ch, profile){
    const cat = await catalog();
    const rows = (await bookRows(tr, code)).filter(r=> r.chapter === ch);
    return profile ? rows.filter(visibleIn(cat, profile)) : rows;
  }

  // Chapter numbers of a native book with anything visible under the profile.
  async function chapters(tr, code, profile){
    const cat = await catalog();
    const all = cat.translations[tr].books[code].chapters;
    if(!profile) return all;
    const visible = visibleIn(cat, profile);
    const rows = await bookRows(tr, code);
    return all.filter(ch=> rows.some(r=> r.chapter === ch && visible(r)));
  }

  /* ---------- Compare ---------- */
  // Live translations (NASB, ESV) have no stored text: identity numbering except the mapped verses in
  // text/<TR>/pivots.json. Returns their native refs for a set of pivots.
  const liveMaps = {};
  async function liveRefs(cat, tr, pivots){
    if(!liveMaps[tr]) liveMaps[tr] = loadOnce('text/' + tr + '/pivots.json').then(m=>{
      const inverse = {}, mapped = new Set();
      for(const [code, refs] of Object.entries(m)) for(const [r, vids] of Object.entries(refs)){
        const chapter = Math.floor(Number(r) / 1000), verse = Number(r) % 1000;
        mapped.add(encode(cat, code, chapter, verse));
        for(const v of vids) (inverse[v] = inverse[v] || []).push({ book: code, chapter, verse });
      }
      return { inverse, mapped };
    });
    const { inverse, mapped } = await liveMaps[tr];
    const books = cat.translations[tr].books, out = [], seen = new Set();
    const add = r=>{ const k = r.book + r.chapter + ':' + r.verse; if(!seen.has(k)){ seen.add(k); out.push(r); } };
    for(const p of pivots){
      const d = decode(cat, p);
      if(books[d.book] && d.verse > 0 && !mapped.has(p)) add(d);
      (inverse[p] || []).forEach(add);
    }
    return out;
  }

  /* compare(primaryTr, book, ch, v, otherTrs) -> [{translation, verses, absent, live?}]
     verses: the translation's own verses whose pivots overlap the clicked verse's pivots, each
     {book, chapter, verse, text, renumbered}; renumbered = not the clicked verse's own book/ch:v.
     absent: null, a reason from absent.json ("variant" | "empty" | "recension" | "missing"),
     or "not-in-translation" when the translation doesn't have that part of the Bible at all. */
  async function compare(primaryTr, code, ch, v, otherTrs = []){
    const cat = await catalog();
    const clicked = (await bookRows(primaryTr, code)).find(r=> r.chapter === ch && r.verse === v);
    if(!clicked) return [];
    const P = new Set(clicked.pivots), books = pivotBooks(cat, clicked.pivots);
    const same = r=> r.book === code && r.chapter === ch && r.verse === v;
    return Promise.all([primaryTr, ...otherTrs.filter(t=> t !== primaryTr)].map(async tr=>{
      const info = cat.translations[tr];
      if(info.live){
        const refs = await liveRefs(cat, tr, clicked.pivots);
        return { translation: tr, live: true, verses: refs.map(r=> ({ ...r, renumbered: !same(r) })),
                 absent: refs.length ? null : 'not-in-translation' };
      }
      const natives = Object.keys(info.books).filter(nb=> info.books[nb].pivots.some(p=> books.includes(p)));
      const rows = (await Promise.all(natives.map(nb=> bookRows(tr, nb)))).flat()
        .filter(r=> r.pivots.some(p=> P.has(p)));
      const verses = rows.filter(r=> r.text).map(r=> ({ book: r.book, chapter: r.chapter, verse: r.verse,
                                                        text: r.text, renumbered: !same(r) }));
      let absent = null;
      if(!verses.length){
        const reasons = await absentOf(tr);
        absent = clicked.pivots.map(p=> reasons[p]).find(Boolean) ||
                 (rows.length ? 'empty' : 'not-in-translation');
      }
      return { translation: tr, verses, absent };
    }));
  }

  /* ---------- original languages ---------- */
  // Tagged words on a set of pivots, grouped by the source's own verse:
  // [{book, chapter, verse, words: [{surface, strong: [..], morph, gloss, translit?, translation?, lemma?, pivot}]}]
  async function originalForPivots(lang, vids){
    const cat = await catalog();
    const want = new Set(vids), out = [];
    const have = new Set(cat.original[lang].books);
    const [tables, docs] = await Promise.all([
      loadOnce('orig/' + lang + '/tables.json'),
      Promise.all(pivotBooks(cat, vids).filter(b=> have.has(b)).map(b=> loadOnce('orig/' + lang + '/' + b + '.json')))]);
    for(const doc of docs){
      const starts = [...doc.start, doc.surface.length];
      doc.ref.forEach((r, vi)=>{
        const chapter = Math.floor(r / 1000), verse = r % 1000, own = encode(cat, doc.book, chapter, verse);
        const words = [];
        for(let n = starts[vi]; n < starts[vi + 1]; n++){
          const pivot = doc.pivot[n] || own;
          if(!want.has(pivot)) continue;
          const w = { surface: doc.surface[n], strong: doc.strong[n] ? doc.strong[n].split('+') : [],
                      morph: tables.morph[doc.morph[n]], gloss: doc.gloss[n], pivot };
          if(doc.translit) w.translit = doc.translit[n];
          if(doc.translation) w.translation = doc.translation[n];
          if(doc.lemma) w.lemma = doc.lemma[n];
          words.push(w);
        }
        if(words.length) out.push({ book: doc.book, chapter, verse, words });
      });
    }
    return out;
  }

  /* ---------- lexicon ---------- */
  function lexiconKey(index, id){
    if(index[id]) return id;
    // extended Strong's (e.g. G2424G) falls back to the base number, zero-padded (Greek) or not (Hebrew)
    const m = /^([GH])0*(\d+)([A-Za-z]*)$/i.exec(id);
    if(!m) return null;
    const L = m[1].toUpperCase();
    return [L + m[2].padStart(4, '0') + m[3], L + m[2] + m[3], L + m[2].padStart(4, '0'), L + m[2]].find(k=> index[k]) || null;
  }
  async function lexicon(lang, id){
    const cat = await catalog();
    const index = await loadOnce('lex/' + lang + '/index.json');
    const key = lexiconKey(index, String(id));
    if(!key) return null;
    const [lemma, translit, gloss, pos] = index[key];
    const bucket = Math.floor(Number(key.replace(/\D/g, '')) / cat.lexicon.bucketSize);
    const defs = await loadOnce('lex/' + lang + '/def/' + bucket + '.json');
    return { id: key, lemma, translit, gloss, pos, definition: defs[key] || '' };
  }

  /* ---------- commentary ---------- */
  // Quote refs on a set of pivots (the index only, for badges): [[vid, ref], ...], de-duplicated.
  async function commentaryRefs(kind, vids){
    const cat = await catalog();
    const have = cat.commentary[kind].verses;
    const idx = await Promise.all(pivotBooks(cat, vids).filter(b=> have[b]).map(b=> loadOnce('comm/' + kind + '/idx/' + b + '.json')));
    const out = [], seen = new Set();
    for(const v of vids) for(const i of idx) for(const r of (i[v] || [])){
      const d = decode(cat, v);
      const loc = typeof r === 'number' ? d.book + '/' + d.chapter + '/' + r : r;
      if(!seen.has(loc)){ seen.add(loc); out.push(loc); }
    }
    return out;
  }
  // The quotes on a set of pivots: [{father, quote, source_title, source_url}], each once.
  async function commentary(kind, vids){
    const locs = await commentaryRefs(kind, vids);
    const paths = [...new Set(locs.map(l=> l.slice(0, l.lastIndexOf('/'))))];
    const bodies = Object.fromEntries(await Promise.all(paths.map(async p=> [p, await loadOnce('comm/' + kind + '/body/' + p + '.json')])));
    return locs.map(l=>{ const cut = l.lastIndexOf('/'); return bodies[l.slice(0, cut)][Number(l.slice(cut + 1))]; });
  }

  return { catalog, navBooks, chapter, chapters, compare, originalForPivots, lexicon, commentary, commentaryRefs,
           vid: async (code, ch, v)=> encode(await catalog(), code, ch, v),
           ref: async vid=> decode(await catalog(), vid) };
}

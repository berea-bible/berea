// Runtime-module tests against the built dist/:  node --test tests/*.test.mjs
// (build it first with `python3 pipeline/build.py`). No dependencies beyond Node itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createData } from '../js/berea-data.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const reads = [];
const data = createData({ fetchJSON: async p=>{ reads.push(p); return JSON.parse(await readFile(ROOT + 'dist/' + p, 'utf8')); } });

const ALL = ['KJV', 'ASV', 'WEB', 'YLT', 'DRA', 'NASB', 'ESV'];
const refs = row=> row.verses.map(v=> `${v.book} ${v.chapter}:${v.verse}`);
async function cmp(tr, book, ch, v, others){
  const rows = await data.compare(tr, book, ch, v, others);
  return Object.fromEntries(rows.map(r=> [r.translation, r]));
}

test('KJV Mark 9:1 <-> DRA 8:39', async ()=>{
  const r = await cmp('KJV', 'MRK', 9, 1, ['DRA']);
  assert.deepEqual(refs(r.DRA), ['MRK 8:39']);
  assert.equal(r.DRA.verses[0].renumbered, true);
  assert.equal(r.KJV.verses[0].renumbered, false);
  const back = await cmp('DRA', 'MRK', 8, 39, ['KJV']);
  assert.deepEqual(refs(back.KJV), ['MRK 9:1']);
});

test('KJV Rev 13:1 <-> DRA 12:18 + 13:1', async ()=>{
  const r = await cmp('KJV', 'REV', 13, 1, ['DRA', 'WEB']);
  assert.deepEqual(refs(r.DRA), ['REV 12:18', 'REV 13:1']);
  assert.match(r.DRA.verses[0].text, /stood upon the sand/);
  assert.deepEqual(refs(r.WEB), ['REV 13:1']);
});

test('KJV Ps 23:1 <-> DRA Ps 22:1', async ()=>{
  const r = await cmp('KJV', 'PSA', 23, 1, ['DRA']);
  assert.deepEqual(refs(r.DRA), ['PSA 22:1']);
  assert.match(r.DRA.verses[0].text, /ruleth me/);
});

test('KJV Ps 3 title <-> Hebrew Ps 3:1', async ()=>{
  const ch = await data.chapter('KJV', 'PSA', 3);
  assert.equal(ch[0].verse, 0);
  assert.match(ch[0].text, /^A Psalm of David, when he fled from Absalom/);
  const heb = await data.originalForPivots('hbo', ch[0].pivots);
  assert.deepEqual(heb.map(g=> `${g.chapter}:${g.verse}`), ['3:1']);
  assert.equal(heb[0].words[0].strong[0], 'H4210');           // מִזְמוֹר, "a psalm"
  const v1 = await data.originalForPivots('hbo', [await data.vid('PSA', 3, 1)]);
  assert.deepEqual(v1.map(g=> `${g.chapter}:${g.verse}`), ['3:2']);
});

test('KJV Ps 51:1 <-> Hebrew 51:3', async ()=>{
  const heb = await data.originalForPivots('hbo', [await data.vid('PSA', 51, 1)]);
  assert.deepEqual(heb.map(g=> `${g.chapter}:${g.verse}`), ['51:3']);
  const title = await data.originalForPivots('hbo', [await data.vid('PSA', 51, 0)]);
  assert.deepEqual(title.map(g=> `${g.chapter}:${g.verse}`), ['51:1', '51:2']);   // two-verse title
});

test('WEB Rom 14:24 <-> KJV Rom 16:25', async ()=>{
  const r = await cmp('WEB', 'ROM', 14, 24, ['KJV', 'ASV']);
  assert.deepEqual(refs(r.KJV), ['ROM 16:25']);
  assert.equal(r.KJV.verses[0].renumbered, true);
  assert.deepEqual(refs(r.ASV), ['ROM 16:25']);
  const back = await cmp('KJV', 'ROM', 16, 25, ['WEB']);
  assert.deepEqual(refs(back.WEB), ['ROM 14:24']);            // WEB's empty 16:25 placeholder isn't shown
});

test('Phil 1:16-17 per translation', async ()=>{
  const r = await cmp('KJV', 'PHP', 1, 16, ALL);               // KJV 1:16: "the one preach Christ of contention"
  assert.deepEqual(refs(r.KJV), ['PHP 1:16']);
  for(const tr of ['WEB', 'YLT']) assert.deepEqual(refs(r[tr]), ['PHP 1:16'], tr);
  for(const tr of ['ASV', 'DRA', 'NASB', 'ESV']) assert.deepEqual(refs(r[tr]), ['PHP 1:17'], tr);
  assert.match(r.ASV.verses[0].text, /faction|contention|strife/i);
  const grc = await data.originalForPivots('grc', [await data.vid('PHP', 1, 16)]);
  assert.deepEqual(grc.map(g=> `${g.chapter}:${g.verse}`), ['1:17']);   // NA order
});

test('KJV 1 Thess 4:18 <-> DRA 4:17', async ()=>{
  const r = await cmp('KJV', '1TH', 4, 18, ['DRA']);
  assert.deepEqual(refs(r.DRA), ['1TH 4:17']);
  const back = await cmp('DRA', '1TH', 4, 11, ['KJV']);         // DRA 4:11 covers KJV 4:11-12
  assert.deepEqual(refs(back.KJV), ['1TH 4:11', '1TH 4:12']);
});

test('DRA Dan 13:1 <-> KJV Susanna 1:1', async ()=>{
  const r = await cmp('DRA', 'DAN', 13, 1, ['KJV', 'WEB']);
  assert.deepEqual(refs(r.KJV), ['SUS 1:1']);
  assert.deepEqual(refs(r.WEB), ['SUS 1:1']);
  const back = await cmp('KJV', 'SUS', 1, 1, ['DRA']);
  assert.deepEqual(refs(back.DRA), ['DAN 13:1']);
  const bel = await cmp('DRA', 'DAN', 13, 65, ['KJV']);            // the Vulgate's 13:65 opens Bel
  assert.deepEqual(refs(bel.KJV), ['BEL 1:1']);
});

test('DRA Esther 11:2 <-> KJV Additions to Esther', async ()=>{
  const r = await cmp('DRA', 'EST', 11, 2, ['KJV']);
  assert.deepEqual(refs(r.KJV), ['ADE 11:2']);
  assert.match(r.KJV.verses[0].text, /Artexerxes|Artaxerxes/);
});

test('DRA Baruch 6:1 <-> KJV Letter of Jeremiah', async ()=>{
  const r = await cmp('DRA', 'BAR', 6, 1, ['KJV', 'WEB']);
  assert.deepEqual(refs(r.KJV), ['LJE 6:2']);                  // KJV 6:1 is a superscription the DRA lacks
  assert.deepEqual(refs(r.WEB), ['LJE 6:2']);
  const title = await cmp('KJV', 'LJE', 6, 1, ['DRA']);
  assert.equal(title.DRA.absent, 'missing');
});

test('ASV on Susanna -> not-in-translation', async ()=>{
  const r = await cmp('KJV', 'SUS', 1, 1, ['ASV', 'YLT', 'NASB']);
  for(const tr of ['ASV', 'YLT', 'NASB']){
    assert.deepEqual(r[tr].verses, [], tr);
    assert.equal(r[tr].absent, 'not-in-translation', tr);
  }
});

test('WEB Acts 8:37 -> empty', async ()=>{
  const r = await cmp('KJV', 'ACT', 8, 37, ['WEB', 'ASV']);
  assert.deepEqual(r.WEB.verses, []);
  assert.equal(r.WEB.absent, 'empty');
  assert.deepEqual(refs(r.ASV), ['ACT 8:37']);
});

test('YLT on Genesis -> not-in-translation', async ()=>{
  const r = await cmp('KJV', 'GEN', 1, 1, ['YLT']);
  assert.equal(r.YLT.absent, 'not-in-translation');
});

test('DRA Tobit -> recension', async ()=>{
  const r = await cmp('KJV', 'TOB', 1, 1, ['DRA', 'WEB']);
  assert.equal(r.DRA.absent, 'recension');
  assert.deepEqual(refs(r.WEB), ['TOB 1:1']);
});

test('protestant profile hides Tobit, DRA Dan 13 and Dan 3:24-90', async ()=>{
  const prot = (await data.navBooks('KJV', 'protestant')).map(b=> b.code);
  const cath = (await data.navBooks('KJV', 'catholic')).map(b=> b.code);
  assert.ok(!prot.includes('TOB') && cath.includes('TOB'));
  assert.equal(prot.length, 66);
  assert.deepEqual(prot.slice(0, 2), ['GEN', 'EXO']);
  assert.ok(cath.indexOf('TOB') > cath.indexOf('MAL') && cath.indexOf('TOB') < cath.indexOf('MAT'));
  assert.ok((await data.navBooks('DRA', 'protestant')).some(b=> b.code === 'DAN'));
  assert.deepEqual(await data.chapter('DRA', 'DAN', 13, 'protestant'), []);
  assert.equal((await data.chapter('DRA', 'DAN', 13, 'catholic')).length, 65);
  const dan = await data.chapters('DRA', 'DAN', 'protestant');
  assert.ok(!dan.includes(13) && !dan.includes(14) && dan.includes(12));
  const d3 = (await data.chapter('DRA', 'DAN', 3, 'protestant')).map(r=> r.verse);
  assert.ok(d3.includes(23) && d3.includes(91) && !d3.includes(24) && !d3.includes(90));
  assert.equal((await data.chapter('DRA', 'DAN', 3, 'catholic')).length, 100);
});

test('lexicon lookups in both languages', async ()=>{
  const en = await data.lexicon('grc', 'G1722');
  assert.equal(en.lemma, 'ἐν'); assert.match(en.gloss, /in/); assert.ok(en.definition.length > 20);
  assert.equal((await data.lexicon('grc', 'G2424G')).id, 'G2424');  // extended Strong's -> base
  assert.equal((await data.lexicon('grc', 'G2424')).gloss, 'Jesus');
  const b = await data.lexicon('hbo', 'H7225');
  assert.equal(b.id, 'H7225'); assert.match(b.gloss, /beginning|first/);
  assert.equal((await data.lexicon('hbo', 'H4210')).id, 'H4210');
  assert.equal(await data.lexicon('grc', 'G999999'), null);
});

test('fathers on John 1:1', async ()=>{
  const q = await data.commentary('fathers', [await data.vid('JHN', 1, 1)]);
  assert.equal(q.length, 106);
  assert.ok(q.every(x=> x.father && x.quote));
  assert.equal(new Set(q).size, 106);
  assert.equal((await data.commentaryRefs('fathers', [await data.vid('JHN', 1, 1)])).length, 106);
});

test('fathers citing "Daniel 13" appear on Susanna', async ()=>{
  const lines = (await readFile(ROOT + 'sources/commentary/fathers/quotes/DAN.jsonl', 'utf8')).trim().split('\n').map(l=> JSON.parse(l));
  const d13 = lines.find(q=> /^DAN 13:\d+$/.test(q.ref));
  const v = Number(d13.ref.split(':')[1]);
  const sus = await data.commentary('fathers', [await data.vid('SUS', 1, v)]);
  assert.ok(sus.some(q=> q.father === d13.author && d13.quote.startsWith(q.quote.replace(/…$/, ''))), d13.ref);
  // and they're reachable from the DRA's Daniel 13, which maps onto Susanna
  const [row] = (await data.chapter('DRA', 'DAN', 13)).filter(r=> r.verse === v);
  assert.equal((await data.commentary('fathers', row.pivots)).length, sus.length);
  assert.equal((await data.commentary('fathers', [await data.vid('DAN', 13, v)])).length, 0);
});

test('Greek: 3 John 1:15 folds into KJV 1:14; words keep their NA verse', async ()=>{
  const g = await data.originalForPivots('grc', [await data.vid('3JN', 1, 14)]);
  assert.deepEqual(g.map(x=> `${x.chapter}:${x.verse}`), ['1:14', '1:15']);
  const r = await cmp('KJV', '3JN', 1, 14, ['NASB']);
  assert.deepEqual(refs(r.NASB), ['3JN 1:14', '3JN 1:15']);
});

test('opening a chapter reads only the catalog, one text file and nothing else', async ()=>{
  const fresh = [];
  const d = createData({ fetchJSON: async p=>{ fresh.push(p); return JSON.parse(await readFile(ROOT + 'dist/' + p, 'utf8')); } });
  await d.chapter('KJV', 'JHN', 1, 'protestant');
  assert.deepEqual(fresh.sort(), ['catalog.json', 'text/KJV/JHN.json']);
});

test('locate keeps the place across translations; liveRows maps live verses', async ()=>{
  const sus = await data.chapter('KJV', 'SUS', 1);
  assert.deepEqual(await data.locate('DRA', sus[0].pivots), { book: 'DAN', chapter: 13, verse: 1 });
  assert.deepEqual(await data.locate('KJV', (await data.chapter('DRA', 'PSA', 22))[1].pivots), { book: 'PSA', chapter: 23, verse: 2 });
  assert.equal(await data.locate('YLT', [await data.vid('GEN', 1, 1)]), null);
  assert.equal(await data.covers('ASV', sus[0].pivots), false);
  assert.equal(await data.covers('WEB', sus[0].pivots), true);
  const rows = await data.liveRows('ESV', '3JN', 1, { 14: 'I hope to see you soon', 15: 'Peace be to you.' });
  assert.deepEqual(rows.map(r=> r.pivots), [[await data.vid('3JN', 1, 14)], [await data.vid('3JN', 1, 14)]]);
  const fromLive = await cmp('ESV', '3JN', 1, 15, ['KJV', 'DRA']);      // reading a live translation
  assert.deepEqual(refs(fromLive.KJV), ['3JN 1:14']);
  assert.equal(fromLive.KJV.verses[0].renumbered, true);
});

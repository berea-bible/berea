#!/usr/bin/env python3
"""Last build step: data fixes, validation, and the split storage format the app loads.

Input: a data directory in the monolithic format (each <book>.json carrying `quotes`, plus one
lexicon.json), as produced by the earlier steps of pipeline/build.py. Output, in place:

  <book>.json               translations and fathers: {ch: {v: [ref, ...]}} -- a ref is an int
                            (index into this chapter's quote file) or "book/ch/i" when the quote
                            lives in another file
  original/<book>.json      the tagged Greek/Hebrew words {ch: {v: [word, ...]}} (without the unused
                            "l" lemma), loaded only when the original-language line or tab is used
  fathers/<book>/<ch>.json  [{father, quote, source_title, source_url}, ...] -- each distinct quote
                            (same author, source and text) stored once, in the chapter that cites it first
  lexicon/index-G.json      {id: [lemma, translit, gloss, pos]}          (loaded on the first word click)
  lexicon/index-H.json
  lexicon/G/<n>.json        {id: definition} for Strong's numbers n*500 .. n*500+499 (loaded per click)
  lexicon/H/<n>.json

Fails (exit 1, nothing written) if any fathers reference points to a verse that doesn't exist in
KJV numbering.

Usage: python3 pipeline/finalize.py --data <dir>   (normally run by pipeline/build.py)
"""
import json, os, re, shutil, sys
from collections import defaultdict

LEX_BUCKET = 500

# Fathers references outside KJV numbering, resolved by reading the quote (see pipeline/README.md).
# (book, ch, v) -> (ch, v) to move the citation there, or None to drop it (already filed on the
# right verse, or no verse can be identified).
FATHERS_REF_FIXES = {
    **{('isa', 13, v): (14, v) for v in (23, 24, 25, 26, 27, 31, 32)},   # Jerome's Isa 14 filed as ch. 13
    ('isa', 19, 26): None,                                   # "(Verse 25, 26.)" also filed on 19:25
    ('ps', 19, 15): (19, 14), ('ps', 52, 10): (52, 9),       # Hebrew numbering
    ('ps', 53, 7): (53, 6), ('ps', 85, 14): (85, 13),
    ('ps', 78, 73): (78, 72), ('ps', 79, 14): (79, 13),      # Augustine's Latin numbering
    ('ps', 98, 10): None,                                    # also filed on 98:9, which it quotes
    ('eccl', 4, 17): (5, 1),                                 # Hebrew 4:17 = KJV 5:1 ("guard your foot")
    ('eccl', 7, 30): None,                                   # also filed on 7:28-29
    ('hag', 1, 17): (1, 7), ('hag', 1, 18): (1, 8),          # "(Verse 17, 18.)" quotes Hag 1:7-8
    ('hos', 14, 10): (14, 9),                                # Hebrew numbering
    ('bar', 3, 38): None,                                    # Vulgate 3:38; also filed on 3:36-37
    ('matt', 6, 38): None,                                   # Tertullian on faith/patience: no verse identifiable
    ('mark', 16, 33): (15, 33),                              # darkness "from the sixth hour" = Mark 15:33
    ('3jn', 1, 15): (1, 14),                                 # Greek 1:15 = the end of KJV 1:14
}


def fix_web_doxology(books):
    """WEB prints the Romans doxology at 14:24-26 (a manuscript tradition); the KJV and this app's
    numbering have it at 16:25-27. Key it there so Compare lines up."""
    web = books['rom']['translations']['WEB']
    for w, k in ((24, 25), (25, 26), (26, 27)):
        if str(w) in web.get('14', {}):
            assert str(k) not in web.get('16', {}), f'WEB Rom 16:{k} already exists'
            web.setdefault('16', {})[str(k)] = web['14'].pop(str(w))


def main(data_dir):
    index = json.load(open(os.path.join(data_dir, 'books-index.json'), encoding='utf-8'))
    order = [e['id'] for e in index['books']]
    books = {bid: json.load(open(os.path.join(data_dir, bid + '.json'), encoding='utf-8')) for bid in order}

    # ---- data fixes ----
    fix_web_doxology(books)
    applied = []
    for (bid, c, v), to in FATHERS_REF_FIXES.items():
        f = books[bid]['fathers']
        ids = f.get(str(c), {}).pop(str(v), None)
        if ids is None:
            continue
        if not f[str(c)]:
            del f[str(c)]
        if to:
            dest = f.setdefault(str(to[0]), {}).setdefault(str(to[1]), [])
            dest.extend(i for i in ids if i not in dest)
        applied.append(f'{bid} {c}:{v} -> ' + (f'{to[0]}:{to[1]}' if to else 'dropped'))

    # ---- validation: every fathers reference must be a real KJV-numbered verse ----
    invalid = [f'{bid} {c}:{v}' for bid in order for c, vs in books[bid]['fathers'].items() for v in vs
               if v not in books[bid]['translations']['KJV'].get(c, {})]
    print(f'fathers reference fixes applied: {len(applied)}')
    if invalid:
        print(f'FAIL: {len(invalid)} fathers references point to verses that don\'t exist in KJV numbering:')
        for r in invalid:
            print('   ', r)
        print('Add them to FATHERS_REF_FIXES in pipeline/finalize.py.')
        return 1

    # ---- fathers: global de-duplication, bodies per (book, chapter) of first citation ----
    home = {}                                   # (father, source_title, quote) -> (book, ch, i)
    files = defaultdict(list)                   # (book, ch) -> [body, ...]
    new_index = {}
    for bid in order:
        doc = books[bid]
        quotes, out = doc['quotes'], {}
        for c in sorted(doc['fathers'], key=int):
            for v in sorted(doc['fathers'][c], key=int):
                refs = []
                for qi in doc['fathers'][c][v]:
                    q = quotes[qi]
                    key = (q['father'], q['source_title'], q['quote'])
                    if key not in home:
                        files[(bid, c)].append({'father': q['father'], 'quote': q['quote'],
                                                'source_title': q['source_title'], 'source_url': q['source_url']})
                        home[key] = (bid, c, len(files[(bid, c)]) - 1)
                    hb, hc, hi = home[key]
                    ref = hi if (hb, hc) == (bid, c) else f'{hb}/{hc}/{hi}'
                    if ref not in refs:
                        refs.append(ref)
                out.setdefault(c, {})[v] = refs
        new_index[bid] = out

    # ---- lexicon: small per-language index + definition buckets ----
    lex = json.load(open(os.path.join(data_dir, 'lexicon.json'), encoding='utf-8'))
    lex_index, buckets = defaultdict(dict), defaultdict(dict)
    for sid, e in lex.items():
        lang, num = sid[0], int(re.sub(r'\D', '', sid))
        lex_index[lang][sid] = [e.get('greek', ''), e.get('translit', ''), e.get('gloss', ''), e.get('pos', '')]
        buckets[(lang, num // LEX_BUCKET)][sid] = e.get('definition', '')

    # ---- write ----
    dump = lambda path, obj: json.dump(obj, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for sub in ('fathers', 'lexicon', 'original'):
        shutil.rmtree(os.path.join(data_dir, sub), ignore_errors=True)
    for (bid, c), bodies in files.items():
        os.makedirs(os.path.join(data_dir, 'fathers', bid), exist_ok=True)
        dump(os.path.join(data_dir, 'fathers', bid, f'{c}.json'), bodies)
    os.makedirs(os.path.join(data_dir, 'original'), exist_ok=True)
    for bid in order:
        doc = books[bid]
        doc.pop('quotes', None)
        doc['fathers'] = new_index[bid]
        words = doc.pop('greek')
        dump(os.path.join(data_dir, 'original', bid + '.json'),
             {c: {v: [{k: w[k] for k in w if k != 'l'} for w in ws] for v, ws in vs.items()} for c, vs in words.items()})
        dump(os.path.join(data_dir, bid + '.json'), doc)
    for lang, entries in lex_index.items():
        os.makedirs(os.path.join(data_dir, 'lexicon', lang), exist_ok=True)
        dump(os.path.join(data_dir, 'lexicon', f'index-{lang}.json'), entries)
    for (lang, n), defs in buckets.items():
        dump(os.path.join(data_dir, 'lexicon', lang, f'{n}.json'), defs)
    os.remove(os.path.join(data_dir, 'lexicon.json'))
    for e in index['books']:
        e['fatherVerseCount'] = sum(len(vs) for vs in new_index[e['id']].values())
    bodies = [b for bs in files.values() for b in bs]
    index['fatherQuoteCount'], index['fatherAuthorCount'] = len(bodies), len({b['father'] for b in bodies})
    index['lexiconBucketSize'] = LEX_BUCKET
    with open(os.path.join(data_dir, 'books-index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh, ensure_ascii=False, indent=2)
    print(f'fathers: {len(bodies)} distinct quotes in {len(files)} chapter files | '
          f'lexicon: {sum(len(v) for v in lex_index.values())} entries, {len(buckets)} definition buckets')
    for a in applied:
        print('   ', a)
    return 0


if __name__ == '__main__':
    a = sys.argv[1:]
    sys.exit(main(os.path.abspath(a[a.index('--data') + 1])))

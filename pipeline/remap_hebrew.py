#!/usr/bin/env python3
"""Re-key the OT Hebrew/Aramaic words (book["greek"]) from Hebrew (BHS/MT) to KJV verse numbering.

The pipeline's parse_hebrew.py keeps OSHB's Hebrew numbering; the translations, verseCounts and
fathers use KJV numbering. Mapping: STEPBible TVTMS (Tyndale House, CC BY 4.0), its
"English (NRSV, ESV, KJV etc) -> Hebrew MT" list, with two fixes checked against the detailed tables:
Neh 7:68-69 (the list misprints it) and the split point of Ps 13:6.

Runs on freshly built (Hebrew-numbered) data, so it is not idempotent: build.py calls it exactly once.

Usage: python3 pipeline/remap_hebrew.py --data <dir> [--dry-run]
"""
import json, os, re, sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dra import fetch  # noqa: E402  (same cache + User-Agent handling)

TVTMS_URL = ('https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Versification/'
             'TVTMS%20-%20Translators%20Versification%20Traditions%20with%20Methodology%20for%20'
             'Standardisation%20for%20Eng%2BHeb%2BLat%2BGrk%2BOthers%20-%20STEPBible.org%20CC%20BY.txt')
SIL = {'Gen':'gen','Exo':'exod','Lev':'lev','Num':'num','Deu':'deut','Jos':'josh','Jdg':'judg','Rut':'ruth',
  '1Sa':'1sam','2Sa':'2sam','1Ki':'1kgs','2Ki':'2kgs','1Ch':'1chr','2Ch':'2chr','Ezr':'ezra','Neh':'neh',
  'Est':'esth','Job':'job','Psa':'ps','Pro':'prov','Ecc':'eccl','Sng':'song','Isa':'isa','Jer':'jer',
  'Lam':'lam','Ezk':'ezek','Dan':'dan','Hos':'hos','Jol':'joel','Amo':'amos','Oba':'obad','Jon':'jonah',
  'Mic':'mic','Nam':'nah','Hab':'hab','Zep':'zeph','Hag':'hag','Zec':'zech','Mal':'mal'}
ATNACH = '֑'
# Half-verse splits: split before the word with this Strong's number instead of at the atnach.
SPLIT_BEFORE = {('ps', 13, 6): 'H7891'}   # KJV 13:6 starts at "I will sing" (after the atnach)


def parse_refs(s):
    """'Num.25:19; 26:1' / '1Ki.22:43,44' / 'Psa.13:6a' -> (book, [(ch, v, part)])"""
    m = re.match(r'^\*?([1-3]?[A-Z][a-z]+)\.(.*)$', s.strip())
    book, rest = m.group(1), m.group(2)
    out, ch = [], None
    for chunk in rest.split(';'):
        chunk = chunk.strip()
        if ':' in chunk:
            c, vs = chunk.split(':'); ch = int(c)
        else:
            vs = chunk
        for v in vs.split(','):
            mv = re.match(r'^(\d+)([ab]?)$', v.strip())
            out.append((ch, int(mv.group(1)), mv.group(2) or None))
    return book, out


def load_mapping(tvtms_path):
    lines = open(tvtms_path, encoding='utf-8').read().split('\n')
    start = next(i for i, l in enumerate(lines) if l.startswith('English (NRSV, ESV, KJV etc)'))
    mapping, no_hebrew = {}, set()
    for l in lines[start + 1:]:
        if l.startswith('Phrases and Abbreviations'):
            break
        cols = [c.strip() for c in l.rstrip('\r').split('\t') if c.strip()]
        if not cols or cols[0].startswith("'"):
            continue
        eb, [(ec, ev, _)] = parse_refs(cols[0])
        if eb not in SIL:
            continue
        bid = SIL[eb]
        if len(cols) == 1:
            no_hebrew.add((bid, ec, ev)); continue
        _, hrefs = parse_refs(cols[1])
        mapping.setdefault(bid, {})[(ec, ev)] = hrefs
    # The simple list misprints Neh 7:68-69; the detailed KJV/Hebrew table ($Neh.7:68-7:73) has
    # KJV 7:68 absent from the Hebrew and KJV 7:69 = Hebrew 7:68.
    no_hebrew.discard(('neh', 7, 69)); no_hebrew.add(('neh', 7, 68))
    mapping['neh'][(7, 69)] = [(7, 68, None)]
    return mapping, no_hebrew


def split_half(words, part, key=None):
    if key in SPLIT_BEFORE:
        idx = next(i for i, w in enumerate(words) if SPLIT_BEFORE[key] in w['s']) - 1
    else:
        idx = next((i for i, w in enumerate(words) if ATNACH in w['g']), len(words) // 2 - 1)
    return words[:idx + 1] if part == 'a' else words[idx + 1:]


def main(data_dir, dry_run):
    idx = json.load(open(os.path.join(data_dir, 'books-index.json')))
    mapping, no_hebrew = load_mapping(fetch(TVTMS_URL, 'tvtms.txt'))
    problems, changed_total, books = [], 0, {}
    for bid in idx['otBookIds']:
        book = json.load(open(os.path.join(data_dir, bid + '.json'), encoding='utf-8'))
        heb, kjv, bmap = book['greek'], book['translations']['KJV'], mapping.get(bid, {})
        used, new = Counter(), {}

        def take(hc, hv, part):
            words = heb.get(str(hc), {}).get(str(hv))
            if words is None:
                problems.append(f'{bid} missing Hebrew {hc}:{hv}'); return []
            used[(hc, hv, part)] += 1
            return split_half(words, part, (bid, hc, hv)) if part else list(words)

        titles = {ec: [w for (hc, hv, p) in hrefs for w in take(hc, hv, p)]
                  for (ec, ev), hrefs in bmap.items() if ev == 0}      # psalm titles -> prepend to verse 1
        for ch, verses in kjv.items():
            c = int(ch)
            for vs in verses:
                v = int(vs)
                if (c, v) in bmap:
                    words = [w for (hc, hv, p) in bmap[(c, v)] for w in take(hc, hv, p)]
                elif (bid, c, v) in no_hebrew:
                    words = []
                else:
                    words = take(c, v, None)
                if v == 1 and c in titles:
                    words = titles[c] + words
                if words:
                    new.setdefault(ch, {})[vs] = words
                elif (bid, c, v) not in no_hebrew:
                    problems.append(f'{bid} {c}:{v} has no Hebrew')
        whole = Counter()
        for (hc, hv, part), n in used.items():
            whole[(hc, hv)] += n if not part else 0.5 * n
        for hc, vs in heb.items():
            for hv in vs:
                if whole.get((int(hc), int(hv)), 0) != 1:
                    problems.append(f'{bid} Hebrew {hc}:{hv} used {whole.get((int(hc), int(hv)), 0)}x')
        mismatched = [c for c, vs in kjv.items() if set(vs) != set(new.get(c, {})) and not
                      all((bid, int(c), int(v)) in no_hebrew for v in set(vs) - set(new.get(c, {})))]
        if mismatched:
            problems.append(f'{bid}: chapters whose Hebrew verse keys differ from KJV: {mismatched[:8]}')
        changed_total += sum(1 for ch, vs in new.items() for v, w in vs.items() if heb.get(ch, {}).get(v) != w)
        book['greek'] = new
        books[bid] = book
    print(f'Hebrew re-keyed to KJV numbering: {changed_total} verses moved | problems: {len(problems)}')
    for p in problems[:40]:
        print('  ', p)
    if problems:
        return 1
    if not dry_run:
        for bid, book in books.items():
            with open(os.path.join(data_dir, bid + '.json'), 'w', encoding='utf-8') as fh:
                json.dump(book, fh, ensure_ascii=False, separators=(',', ':'))
    return 0


if __name__ == '__main__':
    a = sys.argv[1:]
    sys.exit(main(a[a.index('--data') + 1], '--dry-run' in a))

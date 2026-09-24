#!/usr/bin/env python3
"""Rebuild the DRA translation in data/<book>.json, in English (KJV-style) verse numbering.

Source text: Douay-Rheims 1899 American Edition from eBible.org (public domain), which is in
Vulgate order. It is re-keyed to English numbering with the Copenhagen Alliance mappings
(vul.json composed with the inverse of eng.json, see versification.py). Only translations.DRA is
written; KJV/ASV/WEB/YLT and everything else in the book files are left untouched.

Usage:
  python3 pipeline/build_dra.py --dry-run   # fetch, remap, validate, report; write nothing
  python3 pipeline/build_dra.py             # same, then write data/<book>.json
"""
import io, json, os, re, sys, urllib.request, zipfile
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from versification import VulgateToEnglish, remap_vulgate_to_english  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
CACHE = os.path.join(ROOT, 'pipeline', '.cache')
EBIBLE_ZIP = 'https://ebible.org/Scriptures/engDRA_vpl.zip'
MAPPINGS = 'https://raw.githubusercontent.com/Copenhagen-Alliance/versification-specification/master/versification-mappings/standard-mappings/'

# eBible's VPL book codes that differ from USFM
EBIBLE_TO_USFM = {'SOL': 'SNG', 'EZE': 'EZK', 'JOE': 'JOL', 'NAH': 'NAM', 'MAR': 'MRK', 'JOH': 'JHN',
                  'PHI': 'PHP', 'JAM': 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN', 'JUD': 'JUD'}

# Psalm 118 (Vg) opens each stanza with its Hebrew letter ("ALEPH. Blessed are...")
HEADING = re.compile(r'^(ALEPH|BETH|GIMEL|DALETH|HE|VAU|ZAIN|HETH|TETH|JOD|CAPH|LAMED|MEM|NUN|SAMECH|AIN|PHE|SADE|COPH|RES|SIN|TAU)\.\s+')

# Where the 1899 DRA's own numbering differs from the Copenhagen "vul" scheme, renumber the source
# into vul numbering before mapping: usfm -> {(source c, v): (vul c, v)}. Verified by hand against
# the KJV content (see pipeline/README.md); verses not listed keep their number.
def _shift(c, first, last, dc, dv):
    """{(c, v): (c + dc, v + dv)} for v in first..last"""
    return {(c, v): (c + dc, v + dv) for v in range(first, last + 1)}


SOURCE_OVERRIDES = {
    # Vg 115 and 147 continue the numbering of the psalm they were split from in the vul scheme
    # (115:10-19, 147:12-20); the 1899 DRA restarts them at 1.
    'PSA': {**_shift(115, 1, 10, 0, 9), **_shift(147, 1, 9, 0, 11)},
    # The DRA numbers the great fish verse 2:1 (Clementine Vulgate); vul has it at 1:17.
    'JON': {(2, 1): (1, 17), **_shift(2, 2, 11, 0, -1)},
    # DRA 27:3 covers KJV 27:3-4; 27:4-7 are KJV 27:5-8; 27:8 finishes KJV 27:8.
    'NUM': {**_shift(27, 4, 7, 0, 1), (27, 8): (27, 8)},
    # DRA 39:18-19 condense KJV 39:18-21; 39:20-26 = KJV 39:22-28; 39:27 ends KJV 39:28;
    # 39:28-37 = KJV 39:29-38; 39:38 ends KJV 39:38.
    'EXO': {(39, 19): (39, 21), **_shift(39, 20, 26, 0, 2), (39, 27): (39, 28), **_shift(39, 28, 37, 0, 1), (39, 38): (39, 38)},
    # DRA 45:24 is the second half of KJV 45:23; 45:25-26 = KJV 45:24-25. DRA 46:11 covers KJV 46:11-12.
    'ISA': {(45, 24): (45, 23), (45, 25): (45, 24), (45, 26): (45, 25), (46, 12): (46, 13)},
    # DRA 4:11 / 2:11 each cover two KJV verses; the rest of the chapter runs one behind.
    '1TH': _shift(4, 12, 17, 0, 1),
    '2TH': _shift(2, 12, 16, 0, 1),
}

# Source verses placed directly on an English verse, bypassing the mapping (source numbering):
# usfm -> {(source c, v): (English c, v)}.
# Most entries are places where this DRA's verse is the KJV verse of the same number (often covering
# the next KJV verse too) but vul.json numbers it one later; keeping merged text on the first verse
# of the run matches how splits are handled.
TARGET_OVERRIDES = {
    'GEN': {(49, 31): (49, 31), (50, 22): (50, 22)},
    'EXO': {(40, 13): (40, 13)},
    'LEV': {(26, 45): (26, 45)},
    'NUM': {(11, 34): (11, 34)},
    'JOS': {(21, 36): (21, 36), (21, 37): (21, 38)},      # DRA 21:36-37 = KJV 21:36-37, 21:38-39
    '1CH': {(11, 46): (11, 46), (20, 7): (20, 7)},
    'NEH': {(3, 30): (3, 30),
            (7, 68): (7, 68)},   # "Their horses, seven hundred thirty-six..." (vul folds it into 7:67)
    'JOB': {(42, 16): (42, 16)},
    'PSA': {
        (15, 10): (16, 10), (15, 11): (16, 11),   # vul has no verse for KJV 16:10
        (42, 6): (43, 5),                         # "Hope in God..." ends KJV 43:5 (not Ps 42)
        (43, 22): (44, 21), (55, 11): (56, 10),
        (125, 7): (126, 6),                       # second half of KJV 126:6
        (135, 27): (136, 26),                     # extra closing verse in the DRA, kept with 136:26
    },
    'SNG': {(1, 1): (1, 2)},     # "Let him kiss me..." is KJV 1:2 (KJV 1:1 is the title, absent here)
    'ISA': {(8, 22): (8, 22),    # vul -> org 8:23 would merge it into KJV 9:1
            (64, 1): (64, 1)},   # org 63:19 is split across KJV 63:19 / 64:1; this is the 64:1 half
    'JER': {(37, 4): (37, 4)},
    'EZK': {(2, 9): (2, 9)},
    'MIC': {(5, 11): (5, 11)},
    'MRK': {(4, 40): (4, 40)},
    'ACT': {(7, 55): (7, 55), (14, 6): (14, 6)},
    # Verse-order differences vul.json doesn't list: align by content
    'MAT': {(5, 4): (5, 5), (5, 5): (5, 4)},     # Vulgate has "meek" before "mourn"
    'PHP': {(1, 16): (1, 17), (1, 17): (1, 16)}, # KJV reverses 1:16-17
    '2CO': {(13, 13): (13, 14)},                 # "The grace of our Lord..." (KJV 13:13 is inside DRA 13:12)
}


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('downloading', url)
        # eBible.org answers 403 to urllib's default User-Agent
        req = urllib.request.Request(url, headers={'User-Agent': 'berea-pipeline/1.0 (+https://github.com/berea-bible/reader)'})
        with urllib.request.urlopen(req) as r:
            body = r.read()
        with open(path, 'wb') as fh:
            fh.write(body)
    return path


def usfm_to_book_id():
    """Our book ids keyed by USFM code, read from USFM_ID in js/data.js (the one naming table)."""
    js = open(os.path.join(ROOT, 'js', 'data.js'), encoding='utf-8').read()
    block = js[js.index('const USFM_ID'):]
    block = block[:block.index('};')]
    return {usfm: bid for bid, usfm in re.findall(r"'?([0-9a-z]+)'?\s*:\s*'([0-9A-Z]{3})'", block)}


def clean(text):
    text = HEADING.sub('', text)
    text = re.sub(r'\s*\[[^\]]*\]', '', text)       # cross-references in psalm titles, "[2 Kings 16]"
    return re.sub(r'\s+', ' ', text).strip()


def load_ebible(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.endswith('_vpl.txt'))
        lines = io.TextIOWrapper(z.open(name), encoding='utf-8-sig').read().splitlines()
    books = defaultdict(lambda: defaultdict(dict))
    for line in lines:
        m = re.match(r'^(\S+) (\d+):(\d+) (.*)$', line)
        if m:
            code = EBIBLE_TO_USFM.get(m.group(1), m.group(1))
            books[code][int(m.group(2))][int(m.group(3))] = clean(m.group(4))
    return books


def apply_overrides(usfm, chapters):
    moves = SOURCE_OVERRIDES.get(usfm, {})
    out = defaultdict(dict)
    for c, vs in chapters.items():
        for v, t in vs.items():
            nc, nv = moves.get((c, v), (c, v))
            out[nc][nv] = (out[nc][nv] + ' ' + t) if nv in out[nc] else t
    return dict(out)


def ranges(refs):
    """[(c, v), ...] -> 'c:v-w, c:x'"""
    out = []
    for c, v in sorted(refs):
        if out and out[-1][0] == c and out[-1][2] == v - 1:
            out[-1][2] = v
        else:
            out.append([c, v, v])
    return ', '.join(f'{c}:{a}' + (f'-{b}' if b != a else '') for c, a, b in out)


def main(dry_run):
    mapper = VulgateToEnglish(fetch(MAPPINGS + 'vul.json', 'vul.json'), fetch(MAPPINGS + 'eng.json', 'eng.json'))
    source = load_ebible(fetch(EBIBLE_ZIP, 'engDRA_vpl.zip'))
    ids = usfm_to_book_id()
    index = json.load(open(os.path.join(DATA, 'books-index.json'), encoding='utf-8'))
    words = lambda t: set(w for w in re.findall(r'[a-z]+', t.lower()) if len(w) > 3)

    results, logs, failures = {}, {}, []
    overlap = {'old': 0.0, 'new': 0.0, 'n': 0}
    for meta in index['books']:
        bid = meta['id']
        usfm = next(u for u, b in ids.items() if b == bid)
        book = json.load(open(os.path.join(DATA, bid + '.json'), encoding='utf-8'))
        kjv = {int(c): {int(v): t for v, t in vs.items()} for c, vs in book['translations']['KJV'].items()}
        dra, log = remap_vulgate_to_english(mapper, usfm, apply_overrides(usfm, source[usfm]),
                                            target_overrides=TARGET_OVERRIDES.get(usfm))
        # chapters/verses beyond the KJV's (deuterocanonical additions such as Dan 13-14) are dropped
        extra = [(c, v) for c in dra for v in dra[c] if v not in kjv.get(c, {})]
        for c, v in extra:
            del dra[c][v]
        dra = {c: vs for c, vs in dra.items() if vs}
        if extra:
            log.append(('dropped', f'{usfm} {ranges(extra)} (no KJV verse)'))
        results[bid], logs[bid] = dra, log

        # validation: same chapters and verses as the KJV
        missing = [(c, v) for c in kjv for v in kjv[c] if v not in dra.get(c, {})]
        if set(kjv) != set(dra):
            failures.append(f'{bid}: chapter sets differ: KJV-only {sorted(set(kjv) - set(dra))}')
        if missing:
            log.append(('gap', f'{usfm} {ranges(missing)}'))
        # content: per-verse word overlap with the KJV, before and after
        old = book['translations']['DRA']
        for c in kjv:
            for v, t in kjv[c].items():
                kw = words(t)
                overlap['old'] += len(kw & words(old.get(str(c), {}).get(str(v), ''))) / max(1, len(kw))
                overlap['new'] += len(kw & words(dra.get(c, {}).get(v, ''))) / max(1, len(kw))
                overlap['n'] += 1
        # shift scan: runs of 3+ verses that match the KJV clearly better one verse over
        for c in kjv:
            run = []
            for v in sorted(kjv[c]) + [None]:
                better = False
                if v is not None:
                    kw = words(kjv[c][v]); s = lambda d: len(kw & words(dra.get(c, {}).get(v + d, ''))) / max(1, len(kw))
                    better = max(s(-1), s(1)) > s(0) + 0.15
                if better:
                    run.append(v)
                else:
                    if len(run) >= 3:
                        failures.append(f'{bid} {c}:{run[0]}-{run[-1]} looks shifted by a verse')
                    run = []
        if any('dummy verses' in t for vs in dra.values() for t in vs.values()):
            failures.append(f'{bid}: placeholder text present')

    # ---- report ----
    print(f"\nmean per-verse word overlap with KJV: before {overlap['old'] / overlap['n']:.3f} -> after {overlap['new'] / overlap['n']:.3f}")
    kinds = ('split', 'fallback', 'override', 'gap', 'unmapped', 'dropped')
    for kind in kinds:
        items = [d for bid in logs for k, d in logs[bid] if k == kind]
        if items:
            print(f'\n{kind} ({len(items)}):')
            for d in items:
                print('   ', d)
    counts = defaultdict(int)
    for bid in logs:
        for k, _ in logs[bid]:
            counts[k] += 1
    print('\nlog totals:', dict(counts))
    print('\nFAILURES:' if failures else '\nno validation failures', *(['  ' + f for f in failures]), sep='\n')

    spots = [('ps', 9, 1), ('ps', 51, 1), ('dan', 3, 1), ('ps', 119, 1), ('isa', 5, 2), ('john', 15, 1),
             ('rom', 9, 1), ('1kgs', 22, 47), ('neh', 7, 68), ('mal', 4, 1)]
    print('\nspot checks:')
    for bid, c, v in spots:
        tr = json.load(open(os.path.join(DATA, bid + '.json'), encoding='utf-8'))['translations']
        print(f'  {bid} {c}:{v}')
        for code in ('KJV', 'ASV', 'WEB'):
            print(f'     {code}: {tr[code].get(str(c), {}).get(str(v), "")[:90]}')
        print(f'     DRA: {results[bid].get(c, {}).get(v, "<none>")[:150]}')

    if not dry_run:
        if failures:
            print('\nnot writing: fix the failures above first'); return 1
        for bid, dra in results.items():
            path = os.path.join(DATA, bid + '.json')
            book = json.load(open(path, encoding='utf-8'))
            book['translations']['DRA'] = {str(c): {str(v): t for v, t in vs.items()} for c, vs in dra.items()}
            with open(path, 'w', encoding='utf-8') as fh:
                json.dump(book, fh, ensure_ascii=False, separators=(',', ':'))
        print(f'\nwrote DRA into {len(results)} book files')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main('--dry-run' in sys.argv))

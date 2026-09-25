"""eBible VPL zip (engDRA_vpl.zip): one line per verse, "GEN 1:1 text", in the source's own (Vulgate)
numbering. Psalm titles are verse 1 there, as in the Vulgate; nothing is renumbered.

Cleaning as before: Psalm 118's stanza letters ("ALEPH. ") and bracketed cross-references in psalm
titles ("[2 Kings 16]") are removed."""
import io, re, zipfile
from books import BY_CODE
from . import book_code

# eBible's VPL book codes that differ from USFM
EBIBLE_TO_USFM = {'SOL': 'SNG', 'EZE': 'EZK', 'JOE': 'JOL', 'NAH': 'NAM', 'MAR': 'MRK', 'JOH': 'JHN',
                  'PHI': 'PHP', 'JAM': 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN', 'JUD': 'JUD'}
HEADING = re.compile(r'^(ALEPH|BETH|GIMEL|DALETH|HE|VAU|ZAIN|HETH|TETH|JOD|CAPH|LAMED|MEM|NUN|SAMECH|AIN|PHE|SADE|COPH|RES|SIN|TAU)\.\s+')


def clean(text):
    text = HEADING.sub('', text)
    text = re.sub(r'\s*\[[^\]]*\]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def read(path, exclude=()):
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith('_vpl.txt'))
        lines = io.TextIOWrapper(z.open(name), encoding='utf-8-sig').read().splitlines()
    rows, notes, skipped = [], [], set()
    for line in lines:
        m = re.match(r'^(\S+) (\d+):(\d+)(?: (.*))?$', line)
        if not m:
            if line.strip():
                raise ValueError(f"vpl: unparsed line {line[:60]!r}")
            continue
        code = book_code(BY_CODE, EBIBLE_TO_USFM.get(m.group(1), m.group(1)), exclude, "vpl")
        if code is None:
            skipped.add(m.group(1)); continue
        rows.append((code, int(m.group(2)), int(m.group(3)), clean(m.group(4) or '')))
    notes += [f"excluded {b}" for b in sorted(skipped)]
    return rows, notes

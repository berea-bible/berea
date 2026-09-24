"""Versification remapping using the Copenhagen Alliance mappings.

https://github.com/Copenhagen-Alliance/versification-specification
(versification-mappings/standard-mappings/*.json)

Each standard mapping file maps one scheme onto the common "org" baseline (the original-language
numbering: BHS for the OT, NA/UBS for the NT) through its "mappedVerses" object, e.g. in vul.json
"PSA 9:22-39" -> "PSA 10:1-18". Verses a file doesn't mention are numbered the same as in org.

To go from the Vulgate to English (KJV-style) numbering we compose  vul -> org  with the inverse of
eng -> org. Verse 0 is a psalm superscription in schemes that don't number it.

Standard library only.
"""
import json, re
from collections import defaultdict

_REF = re.compile(r'^([1-4]?[A-Z][A-Z0-9]{1,2}) (\d+):(\d+)(?:-(\d+))?$')


def parse_range(ref):
    """'PSA 9:22-39' -> ('PSA', [(9, 22), ..., (9, 39)]); None for refs we can't use (e.g. 'ESG 1:1a')."""
    m = _REF.match(ref.strip())
    if not m:
        return None
    book, c, a = m.group(1), int(m.group(2)), int(m.group(3))
    b = int(m.group(4)) if m.group(4) else a
    return book, [(c, v) for v in range(a, b + 1)]


def load_mapping(path):
    """Parse a Copenhagen mapping file into {(book, ch, v): [(book, ch, v), ...]} (source -> targets).

    Equal-length ranges pair up in order. A source range onto one target is a merge (each source verse
    maps to that target); one source verse onto a target range is a split (it maps to all of them).
    A source verse listed more than once gets the union of its targets, except that a verse-0 target
    listed alongside a real one ("PSA 9:22" -> "PSA 10:0" next to "PSA 9:22-39" -> "PSA 10:1-18") only
    marks where a psalm starts, and is ignored.
    """
    with open(path, encoding='utf-8') as fh:
        mapped = json.load(fh)['mappedVerses']
    out, skipped = defaultdict(list), []
    for src, dst in mapped.items():
        s, d = parse_range(src), parse_range(dst)
        if not s or not d:
            skipped.append((src, dst)); continue
        (sb, sv), (db, dv) = s, d
        if len(sv) == len(dv):
            pairs = [(x, [y]) for x, y in zip(sv, dv)]
        elif len(dv) == 1:
            pairs = [(x, dv) for x in sv]
        elif len(sv) == 1:
            pairs = [(sv[0], dv)]
        else:
            skipped.append((src, dst)); continue
        for (c, v), targets in pairs:
            for tc, tv in targets:
                t = (db, tc, tv)
                if t not in out[(sb, c, v)]:
                    out[(sb, c, v)].append(t)
    for key, targets in out.items():
        real = [t for t in targets if t[2] != 0]
        if real and len(real) < len(targets):
            out[key] = real
    return dict(out), skipped


def invert(mapping):
    """{src: [targets]} -> {target: [srcs]}"""
    inv = defaultdict(list)
    for s, ts in mapping.items():
        for t in ts:
            if s not in inv[t]:
                inv[t].append(s)
    return dict(inv)


class VulgateToEnglish:
    """Composes vul -> org with the inverse of eng -> org."""

    def __init__(self, vul_path, eng_path):
        self.vul, self.vul_skipped = load_mapping(vul_path)
        eng, self.eng_skipped = load_mapping(eng_path)
        self.org_to_eng = invert(eng)
        self.eng_sources = set(eng)          # English refs that eng.json renumbers

    def org_to_english(self, o):
        engs = self.org_to_eng.get(o)
        if engs is None:
            # not renumbered by eng.json: same number in English, unless eng.json moved that English
            # verse elsewhere (then nothing in English carries this org number)
            engs = [] if o in self.eng_sources else [o]
        return engs

    def targets(self, book, c, v):
        """(English refs for Vulgate ref (book, c, v) in order, used_fallback)."""
        out, fallback = [], False
        for o in self.vul.get((book, c, v), [(book, c, v)]):
            engs = self.org_to_english(o)
            if not engs and o[2] > 0:
                # org splits a verse that English keeps whole (e.g. 1SA 20:42 = org 20:42 + 21:1) or
                # numbers a two-part psalm title (org PSA 51:1-2 = English 51:0): the part with no
                # English number belongs to the English verse of the next org verse
                for nxt in ((o[0], o[1], o[2] + 1), (o[0], o[1] + 1, 1)):   # next verse, or next chapter's first
                    if nxt in self.org_to_eng or nxt in self.vul_targets:
                        engs = self.org_to_english(nxt)[:1]
                        break
                fallback = bool(engs)
            for e in engs:
                if e not in out:
                    out.append(e)
        return out, fallback

    @property
    def vul_targets(self):
        if not hasattr(self, '_vul_targets'):
            self._vul_targets = {t for ts in self.vul.values() for t in ts}
        return self._vul_targets


def remap_vulgate_to_english(mapper, book_code, vulgate_verses, english_has_verse0=False, target_overrides=None):
    """Re-key {ch: {v: text}} from Vulgate to English numbering.

    Returns (english_verses, log). english_verses is {ch: {v: text}} (ints). log is a list of
    (kind, detail) tuples:
      'merge'  several Vulgate verses concatenated into one English verse
      'split'  one Vulgate verse spans several English verses: the whole text is put on the first,
               the rest of the run is left unset (review by hand)
      'title'  verse-0 text prefixed onto English verse 1
      'fallback'  Vulgate verse whose org verse has no English number, merged into the next one's
      'override'  Vulgate verse placed by target_overrides instead of the mapping
      'other-book'  Vulgate verse maps outside this book (e.g. DAN 3:24-90 -> S3Y), skipped
      'unmapped'  Vulgate verse with no English counterpart, skipped

    target_overrides: optional {(c, v): (english c, english v)} for Vulgate verses whose text the
    source keeps separate where the mapping merges it (source-specific, applied as-is).
    """
    placed = defaultdict(list)          # (c, v) -> [(vulgate order key, text)]
    log = []
    target_overrides = target_overrides or {}
    for c in sorted(vulgate_verses):
        for v in sorted(vulgate_verses[c]):
            text = vulgate_verses[c][v]
            if (c, v) in target_overrides:
                tc, tv = target_overrides[(c, v)]
                placed[(tc, tv)].append(((c, v), text))
                log.append(('override', f'{book_code} {c}:{v} -> {tc}:{tv}')); continue
            targets, fallback = mapper.targets(book_code, c, v)
            if fallback:
                log.append(('fallback', f'{book_code} {c}:{v} -> ' + ', '.join(f'{x}:{y}' for _, x, y in targets)))
            here = [t for t in targets if t[0] == book_code]
            if not targets:
                log.append(('unmapped', f'{book_code} {c}:{v}')); continue
            if not here:
                log.append(('other-book', f'{book_code} {c}:{v} -> ' + ', '.join(f'{b} {x}:{y}' for b, x, y in targets))); continue
            if len(here) > 1:
                log.append(('split', f'{book_code} {c}:{v} -> ' + ', '.join(f'{x}:{y}' for _, x, y in here)))
            _, tc, tv = here[0]
            placed[(tc, tv)].append(((c, v), text))
    out = defaultdict(dict)
    for (c, v), parts in placed.items():
        parts.sort()
        if len(parts) > 1:
            log.append(('merge', f'{book_code} ' + ', '.join(f'{a}:{b}' for (a, b), _ in parts) + f' -> {c}:{v}'))
        out[c][v] = ' '.join(t for _, t in parts)
    if not english_has_verse0:
        for c in list(out):
            if 0 in out[c]:
                title = out[c].pop(0)
                out[c][1] = (title + ' ' + out[c].get(1, '')).strip()
                log.append(('title', f'{book_code} {c}:0 -> {c}:1'))
    return {c: dict(sorted(vs.items())) for c, vs in sorted(out.items())}, log

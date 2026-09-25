"""Versification engine: maps a source's native verses onto the pivot (TVTMS Standard = KJV numbering,
psalm titles as verse 0), using the Expanded section of STEPBible's TVTMS.

Rows: SourceType (a "+"-joined label), SourceRef, StandardRef, Action, ..., Tests. For each native verse
the engine looks at the rows whose SourceRef is that verse (or one of its parts "!a", "!b", ...), grouped
by label. A label applies when every part of the verse listed for it has a row whose Tests pass (rows
with the same SourceRef are alternatives). The verse then maps to the union of the passing rows'
StandardRefs. Verses no row mentions keep their number. Range SourceRefs ("Exo.28:23-25") are summaries
of per-verse rows and are skipped; "IfEmpty verse" rows map nothing: they list Standard verses a Bible
may lack (textual variants).

Tests (semantics from the TVTMS header):
  R=Exist      R has text                        R.n=Exist (n >= 1): R has n+1 subverses (never, here)
  R=NotExist   R has no text (the header also asks for text in R-1, but the data doesn't use it that way:
               "Psa.9:30=NotExist" tells a 21-verse Hebrew Psalm 9 from the 39-verse Latin one)
  R=Last       R is the chapter's last verse with text
  C:TextBeforeV1=Exist|NotExist    chapter C has a psalm title (native verse 0)
  A<B, A>B     word counts, with "*n" multipliers and "+" sums; R.0 is the whole verse
Word-count tests are unreliable across languages, so each decision records whether the structural tests
alone would have settled it; the ones that needed word counts are reported for review.

Manifest corrections (see docs/v2-plan.md §5.3):
  [[override]] ref, use = "identity" | a label token ("Latin", "Greek2", ...): that tradition's rows are
                applied without their tests (or the verse keeps its number)
  [[map]]      from, to: explicit native -> pivot ranges; equal lengths pair 1:1, one single side merges
                or splits; to = "drop" removes the verse/citation
After the TVTMS step, pivot Esther 10:4-16:24 becomes ADE (same numbers) and Baruch 6 becomes LJE 6, so
every deuterocanonical text is its own pivot book.
"""
import re
from collections import defaultdict
from books import BY_CODE

TITLE = 0
SPECIAL = {"LJE": "LJE", "ADE": None, "PS2": None, "ODA": None, "4ES": None, "4MA": None, "3MA": None}


def tv_book(name):
    """TVTMS book name -> our code (None for books we don't have). TVTMS mixes case: Lje/LJe, Ezk, Sng."""
    up = name.upper()
    if up in SPECIAL:
        return SPECIAL[up]
    return up if up in BY_CODE else None


def native_to_tv(code, ch):
    """The book TVTMS files a native verse under: a Letter of Jeremiah numbered as chapter 6 (KJV, WEB) is
    "Bar.6", the KJV's Additions to Esther (10:4-16:24) are "Est"; a chapter-1 LJE would be TVTMS's "Lje"."""
    if code == "LJE" and ch == 6:
        return "BAR"
    if code == "ADE":
        return "EST"
    return code


def pivot_book(code, ch, v):
    """Post-TVTMS book re-map onto separate deuterocanonical pivot books."""
    if code == "EST" and (ch > 10 or (ch == 10 and v >= 4)):
        return "ADE"
    if code == "BAR" and ch == 6:
        return "LJE"
    return code


# ---------------------------------------------------------------- reference parsing
REF = re.compile(r"^\*?([1-4]?[A-Za-z][A-Za-z0-9]{1,2})\.(.*)$")


def parse_source_ref(s):
    """'Gen.3:1!a' -> (book, ch, v, part); 'Psa.3:Title' -> v = 0. None for ranges/lists/lettered chapters."""
    m = REF.match(s.strip())
    if not m:
        return None
    b = tv_book(m.group(1))
    mm = re.match(r"^(\d+):(\d+|Title)(?:!(\w+))?$", m.group(2).strip())
    if not b or not mm:
        return None
    return b, int(mm.group(1)), TITLE if mm.group(2) == "Title" else int(mm.group(2)), mm.group(3) or ""


def split_book(chunk):
    """'1Ki.10:22' -> ('1Ki', '10:22'); '9:15' -> (None, '9:15'). A book prefix has a '.' before the ':'."""
    head = chunk.split(":")[0]
    if "." in head:
        b, rest = chunk.split(".", 1)
        return b.lstrip("*"), rest
    return None, chunk


def parse_standard_refs(s, chapter_len):
    """'Est.10:4-13; 11:1' / 'Gen.2:25-3:1' / 'Psa.3:Title' / '3Jn.1:14!b' / 'Dan.4:37a-c' -> [(book, ch, v)];
    None when the book isn't one of ours."""
    s = s.strip().replace(": ", "; ")
    out, book, ch = [], None, None
    for chunk in re.split(r";\s*", s):
        b, chunk = split_book(chunk.strip())
        if b is not None:
            book = tv_book(b)
        if book is None:
            return None
        cm = re.match(r"^(\d+):(.*)$", chunk.strip())
        if cm:
            ch, chunk = int(cm.group(1)), cm.group(2)
        for part in chunk.split(","):
            part = part.strip()
            if part.startswith("Title"):
                out.append((book, ch, TITLE)); continue
            part = re.sub(r"(!\w+|\*[a-z](-[a-z])?|[a-z](-[a-z])?)$", "", part)
            x = re.match(r"^(\d+)(?:-(\d+)(?::(\d+))?)?$", part)
            if not x:
                raise ValueError(f"unparsed StandardRef {s!r}")
            a = int(x.group(1))
            if x.group(3):                       # cross-chapter: a..end of ch, then 1..b of the next
                out += [(book, ch, v) for v in range(a, chapter_len[(book, ch)] + 1)]
                ch = int(x.group(2)); out += [(book, ch, v) for v in range(1, int(x.group(3)) + 1)]
            else:
                out += [(book, ch, v) for v in range(a, int(x.group(2) or a) + 1)]
    return out


# ---------------------------------------------------------------- table
class Table:
    def __init__(self, path, kjv_verses):
        lines = open(path, encoding="utf-8").read().split("\n")
        s = next(i for i, l in enumerate(lines) if l.startswith("#DataStart(Expanded)"))
        e = next(i for i, l in enumerate(lines) if l.startswith("#DataEnd(Expanded)"))
        raw = []
        for l in lines[s + 1:e]:
            c = l.rstrip("\r").split("\t")
            if len(c) < 4 or not c[1].strip() or c[0].startswith("'") or c[0] == "SourceType":
                continue
            raw.append(c + [""] * (9 - len(c)))
        # chapter lengths of the Standard: KJV plus every single-verse StandardRef
        chapter_len = defaultdict(int)
        for b, c, v in kjv_verses:
            chapter_len[(b, c)] = max(chapter_len[(b, c)], v)
        for c in raw:
            for b, ch, v in parse_standard_refs(re.sub(r"-\d+(:\d+)?", "", c[2]), defaultdict(int)) or []:
                chapter_len[(b, ch)] = max(chapter_len[(b, ch)], v)
        self.rows = defaultdict(list)      # (book, ch, v) -> [(label, part, standard, action, tests)]
        self.if_empty = set()              # Standard verses a Bible may lack
        self.standard = set(kjv_verses)
        for c in raw:
            label = c[0].strip().rstrip("=").strip()
            action = c[3].strip().rstrip("*").strip()
            std = parse_standard_refs(c[2], chapter_len) if c[2].strip() else []
            if std is None:
                continue
            self.standard.update(std)
            if action == "IfEmpty verse":
                self.if_empty.update(std); continue
            src = parse_source_ref(c[1])
            if not src:
                continue
            b, ch, v, part = src
            self.rows[(b, ch, v)].append((label, part, tuple(std), action, parse_tests(c[8], b)))
        self.standard = {(pivot_book(*k), k[1], k[2]) for k in self.standard}
        self.if_empty = {(pivot_book(*k), k[1], k[2]) for k in self.if_empty}


# ---------------------------------------------------------------- tests
def parse_tests(s, row_book):
    atoms = []
    for a in (x.strip() for x in s.split("&")):
        if not a:
            continue
        m = re.match(r"^(.+?)=(Exist|NotExist|Last)$", a)
        if m:
            atoms.append(("state", term(m.group(1), row_book), m.group(2))); continue
        m = re.match(r"^(.+?)([<>])(.+)$", a)
        if not m:
            raise ValueError(f"unparsed test {a!r}")
        atoms.append(("cmp", [term(t, row_book) for t in m.group(1).split("+")], m.group(2),
                      [term(t, row_book) for t in m.group(3).split("+")]))
    return atoms


def term(t, row_book):
    """'Gen.6:1*2' -> (book, ch, v, sub, mult); v = 'T' for TextBeforeV1; ch is None for lettered chapters."""
    t = t.strip()
    mult = 1
    if "*" in t:
        t, mult = t.split("*"); mult = int(mult)
    b, rest = split_book(t)
    book = (tv_book(b) or "?") if b is not None else row_book
    m = re.match(r"^(\w+):(TextBeforeV1|\d+)(?:\.(\d+))?$", rest)
    if not m:
        raise ValueError(f"unparsed test term {t!r}")
    ch = int(m.group(1)) if m.group(1).isdigit() else None
    v = "T" if m.group(2) == "TextBeforeV1" else int(m.group(2))
    return (book, ch, v, int(m.group(3)) if m.group(3) else None, mult)


class Model:
    """A source as TVTMS sees it: {(tvtms book, ch, v): word count}; 0 = present but empty."""

    def __init__(self, native_counts):
        self.wc = {}
        self.chapters = set()
        self.last = defaultdict(int)
        for (code, ch, v), n in native_counts.items():
            k = (native_to_tv(code, ch), ch, v)
            self.wc[k] = n
            self.chapters.add(k[:2])
            if n and v:
                self.last[k[:2]] = max(self.last[k[:2]], v)

    def has_text(self, b, ch, v):
        return self.wc.get((b, ch, v), 0) > 0

    def state(self, t, what):
        b, ch, v, sub, _ = t
        if ch is None:                                  # lettered chapter (Greek Esther A-F): never ours
            return what == "NotExist"
        if v == "T":
            exists = self.has_text(b, ch, TITLE)
        elif sub:                                       # subverses: our sources have none
            exists = False
        else:
            exists = self.has_text(b, ch, v)
        if what == "Exist":
            return exists
        if what == "Last":
            return v != "T" and not sub and exists and self.last[(b, ch)] == v
        return not exists

    def words(self, terms):
        return sum(self.wc.get((b, ch, v), 0) * mult for b, ch, v, sub, mult in terms if ch is not None and v != "T")

    def passes(self, tests, count_words=True):
        """True/False; with count_words=False, word-count atoms are unknown (None) unless a structural
        atom already fails."""
        unknown = False
        for a in tests:
            if a[0] == "state":
                if not self.state(a[1], a[2]):
                    return False
            elif count_words:
                l, r = self.words(a[1]), self.words(a[3])
                if not (l < r if a[2] == "<" else l > r):
                    return False
            else:
                unknown = True
        return None if unknown else True


# ---------------------------------------------------------------- mapping
class Outcome:
    """What one tradition (label) gives a native verse: Standard refs, per part when the verse is split."""

    def __init__(self, parts):
        self.parts = parts                                     # [(part, (refs...)), ...]; part "" = whole
        self.refs = tuple(dict.fromkeys(r for _, rs in parts for r in rs))

    def key(self):
        return tuple(self.parts)


def label_outcomes(model, rows, count_words=True):
    """{label: (Outcome, maybe)} for the labels whose rows pass for every listed part of the verse.
    maybe = the label depends on word-count tests, which count_words=False leaves undecided."""
    by_label = defaultdict(lambda: defaultdict(list))
    for label, part, std, action, tests in rows:
        by_label[label][part].append((std, tests))
    out = {}
    for label, parts in by_label.items():
        got, maybe = [], False
        for part in sorted(parts):
            passing = [(std, model.passes(t, count_words)) for std, t in parts[part]]
            good = [std for std, p in passing if p] or [std for std, p in passing if p is None]
            if not good:
                break
            maybe |= not any(p for _, p in passing)
            got.append((part, tuple(dict.fromkeys(r for std in good for r in std))))
        else:
            if "" in parts and len(parts) > 1:       # whole-verse summary row next to part rows
                got = [g for g in got if g[0]]
            out[label] = (Outcome(got), maybe)
    return out


def choose(outcomes, tested):
    """Labels with tests win over untested defaults (AllBibles); returns {label: Outcome}."""
    with_tests = {l: o for l, o in outcomes.items() if l in tested}
    return with_tests or outcomes


class Mapper:
    def __init__(self, table):
        self.table = table

    def map_source(self, name, native_counts, overrides=(), maps=()):
        """native_counts: {(code, ch, v): word count}. Returns (mapping {native: [(part, [pivot, ...]), ...]},
        decisions [dict], errors [str]). Most verses map as [("", [pivot])]."""
        model = Model(native_counts)
        mapping, decisions, errors = {}, [], []
        forced = expand_overrides(overrides)
        explicit, dropped = expand_maps(maps)
        for key in native_counts:
            code, ch, v = key
            if key in dropped:
                decisions.append(dict(ref=key, pivots=[], how="map", reason=maps_reason(maps, key))); continue
            if key in explicit:
                mapping[key] = [("", explicit[key])]
                decisions.append(dict(ref=key, pivots=explicit[key], how="map", reason=maps_reason(maps, key))); continue
            tvk = (native_to_tv(code, ch), ch, v)
            rows = self.table.rows.get(tvk, [])
            tested = {l for l, _, _, _, t in rows if t}
            use = forced.get(key)
            if use and use != "identity" and not any(use in r[0].split("+") for r in rows):
                use = None                             # the forced tradition says nothing here: normal rules
            if use == "identity":
                parts, how = [("", (tvk,))], "override"
            elif use:
                chosen = [r for r in rows if use in r[0].split("+")]
                by_part = defaultdict(list)
                for label, part, std, action, tests in chosen:
                    by_part[part] += [x for x in std if x not in by_part[part]]
                if "" in by_part and len(by_part) > 1:
                    del by_part[""]
                parts, how = sorted((p, tuple(r)) for p, r in by_part.items()), "override"
            elif not rows:
                parts, how = [("", (tvk,))], "identity"
            else:
                res = choose({l: o for l, (o, _) in label_outcomes(model, rows).items()}, tested)
                keys = {o.key() for o in res.values()}
                if len(keys) > 1:
                    errors.append(f"{fmt(key)}: traditions disagree: " +
                                  "; ".join(f"{l} -> {fmt_list(o.refs)}" for l, o in sorted(res.items())))
                    continue
                if not res:                            # rows only for other traditions: keeps its number
                    parts, how = [("", (tvk,))], "identity"
                else:
                    parts = next(iter(res.values())).parts
                    alts = self.possible(model, rows, tested, tvk) - {tuple(parts)}
                    how = "word-count" if alts else "structural"
            out = [(p, [(pivot_book(*s), s[1], s[2]) for s in refs]) for p, refs in parts]
            mapping[key] = out
            pivots = [x for _, ps in out for x in ps]
            if how == "word-count":
                decisions.append(dict(ref=key, pivots=pivots, how=how, labels=sorted(res),
                                      alternatives=[fmt_list([r for _, rs in a for r in rs]) for a in sorted(alts)]))
            elif how != "identity" and pivots != [key]:
                decisions.append(dict(ref=key, pivots=pivots, how=how))
        for key, parts in mapping.items():
            for _, ps in parts:
                for p in ps:
                    if p not in self.table.standard and p[0] not in OWN_NUMBERING:
                        errors.append(f"{fmt(key)} -> {fmt(p)}: not a Standard (KJV) verse")
        return mapping, decisions, errors

    def possible(self, model, rows, tested, tvk):
        """Every mapping the verse could get if its word-count tests went either way."""
        res = label_outcomes(model, rows, count_words=False)
        sure = {l: o for l, (o, maybe) in res.items() if not maybe}
        maybe = {l: o for l, (o, m) in res.items() if m}
        def pick(labels):
            chosen = choose(labels, tested)
            ks = {tuple(o.parts) for o in chosen.values()}
            return ks if ks else {(("", (tvk,)),)}
        out = pick(sure)
        for l, o in maybe.items():
            out |= pick({**sure, l: o})
        return out


# Books whose pivot is the source's own numbering (not in the KJV-based Standard): WEB's Greek Esther.
OWN_NUMBERING = {"ESG"}


def fmt(k):
    return f"{k[0]} {k[1]}:{k[2]}"


def fmt_list(ks):
    return ", ".join(fmt(k) for k in ks)


def parse_range(s):
    """'PHP 1:16-17' / 'DAN 13:1-14:42' / 'TOB' -> list of (code, ch, v) or ('BOOK', code)"""
    m = re.match(r"^(\S+)(?: (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?)?$", s.strip())
    if not m:
        raise ValueError(f"bad reference {s!r}")
    code = m.group(1)
    if code not in BY_CODE:
        raise ValueError(f"unknown book in {s!r}")
    if not m.group(2):
        return ("BOOK", code)
    c1, v1 = int(m.group(2)), int(m.group(3))
    c2 = int(m.group(4)) if m.group(4) else c1
    v2 = int(m.group(5)) if m.group(5) else v1
    if c2 == c1:
        return [(code, c1, v) for v in range(v1, v2 + 1)]
    return ("SPAN", code, (c1, v1), (c2, v2))


def expand_overrides(overrides):
    out = {}
    for o in overrides:
        r = parse_range(o["ref"])
        if isinstance(r, tuple):                 # book or cross-chapter span: matched lazily
            out.setdefault("__spans__", []).append((r, o["use"]))
            continue
        for k in r:
            out[k] = o["use"]
    spans = out.pop("__spans__", [])
    return SpanDict(out, spans)


class SpanDict(dict):
    def __init__(self, base, spans):
        super().__init__(base)
        self.spans = spans

    def get(self, k, default=None):
        if k in self:
            return self[k]
        for r, use in self.spans:
            if r[0] == "BOOK" and k[0] == r[1]:
                return use
            if r[0] == "SPAN" and k[0] == r[1] and r[2] <= (k[1], k[2]) <= r[3]:
                return use
        return default


def expand_maps(maps):
    explicit, dropped = {}, set()
    for m in maps:
        src = parse_range(m["from"])
        if not isinstance(src, list):
            raise ValueError(f"[[map]] from must be a verse range within one chapter: {m['from']!r}")
        if m["to"] == "drop":
            dropped.update(src); continue
        dst = parse_range(m["to"])
        if not isinstance(dst, list):
            raise ValueError(f"[[map]] to must be a verse range within one chapter: {m['to']!r}")
        if len(src) == len(dst):
            pairs = [(s, [d]) for s, d in zip(src, dst)]
        elif len(dst) == 1:
            pairs = [(s, dst) for s in src]
        elif len(src) == 1:
            pairs = [(src[0], dst)]
        else:
            raise ValueError(f"[[map]] {m['from']} -> {m['to']}: lengths differ and neither side is one verse")
        for s, d in pairs:
            explicit[s] = [(pivot_book(*x), x[1], x[2]) for x in d]
    return explicit, dropped


def maps_reason(maps, key):
    for m in maps:
        r = parse_range(m["from"])
        if isinstance(r, list) and key in r:
            return m.get("reason", "")
    return ""

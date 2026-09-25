"""Readers for sources/ (the committed, native-numbered layer). Standard library only."""
import csv, json, os, re, tomllib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, "sources")
csv.field_size_limit(1 << 30)


def tsv_rows(path):
    with open(path, encoding="utf-8", newline="") as fh:
        r = csv.reader(fh, delimiter="\t", quoting=csv.QUOTE_NONE)
        header = next(r)
        for row in r:
            yield dict(zip(header, row))


def manifest(*parts):
    return tomllib.load(open(os.path.join(SOURCES, *parts, "manifest.toml"), "rb"))


def book_files(folder):
    return sorted(f[:-4] for f in os.listdir(folder) if f.endswith(".tsv"))


def translation_ids():
    return sorted(os.listdir(os.path.join(SOURCES, "translations")))


def translation(tid):
    """(manifest, {book: [(ch, v, text), ...]}) in the source's own order; live translations have no text."""
    m = manifest("translations", tid)
    folder = os.path.join(SOURCES, "translations", tid)
    books = {b: [(int(r["chapter"]), int(r["verse"]), r["text"]) for r in tsv_rows(os.path.join(folder, b + ".tsv"))]
             for b in book_files(folder)}
    return m, books


def greek_selected(ws):
    """The words shown for one native verse: the NA/SBL text, or the KJV/TR text where NA has no words
    (e.g. Matt 17:21). Words without a surface form or a G Strong's number are skipped, as before."""
    def ok(w):
        return w["surface"] and any(re.match(r"^G\d+[A-Z]?$", s) for s in w["strongs"].split("+"))
    na = [w for w in ws if "n" in w["type"].lower() and ok(w)]
    return na or [w for w in ws if "n" not in w["type"].lower() and "k" in w["type"].lower() and ok(w)]


def original(lang):
    """(manifest, {book: {(ch, v): [word dict, ...]}}) with the words the app shows, in verse order."""
    m = manifest("original", lang)
    folder = os.path.join(SOURCES, "original", lang)
    out = {}
    for b in book_files(folder):
        verses = {}
        for r in tsv_rows(os.path.join(folder, b + ".tsv")):
            verses.setdefault((int(r["chapter"]), int(r["verse"])), []).append(r)
        if lang == "grc":
            verses = {k: greek_selected(ws) for k, ws in verses.items()}
        else:   # Hebrew: ketiv forms and words without a Strong's number aren't shown
            verses = {k: [w for w in ws if not w["type"] and hebrew_strongs(w["lemma"])] for k, ws in verses.items()}
        out[b] = {k: ws for k, ws in verses.items() if ws}
    return m, out


def hebrew_strongs(lemma):
    """'b/7225' -> ['H7225']; '1254 a' -> ['H1254']; 'c/d/776' -> ['H776'] (prefix particles are in the morph)."""
    return ["H" + m.group(1) for raw in lemma.split("/") for m in [re.match(r"^(\d+)", raw.strip().rstrip("+").strip())] if m]


def lexicon(lang):
    return [json.loads(l) for l in open(os.path.join(SOURCES, "lexicon", lang + ".jsonl"), encoding="utf-8")]


def fathers():
    folder = os.path.join(SOURCES, "commentary", "fathers")
    m = manifest("commentary", "fathers")
    authors = list(tsv_rows(os.path.join(folder, "authors.tsv")))
    quotes = [json.loads(l) for f in sorted(os.listdir(os.path.join(folder, "quotes")))
              for l in open(os.path.join(folder, "quotes", f), encoding="utf-8")]
    return m, authors, quotes

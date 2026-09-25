#!/usr/bin/env python3
"""raw/ -> sources/: run every importer named by a manifest, in the sources' own numbering.

    python3 pipeline/import_sources.py                 # verify raw/ against the lock, then import
    python3 pipeline/import_sources.py --update-lock   # re-hash raw/ into sources/sources.lock.json first

Writes (only files whose content changed; stale book files are removed):
  sources/translations/<id>/<BOOK>.tsv      chapter, verse, text           (header row, raw order)
  sources/original/{grc,hbo}/<BOOK>.tsv     one row per word               (header row, raw order)
  sources/lexicon/{grc,hbo}.jsonl           one entry per line
  sources/commentary/fathers/authors.tsv    every corpus author, with the eligibility decision
  sources/commentary/fathers/quotes/<BOOK>.jsonl   one citation per line, refs as the corpus gives them
Manifests (hand-edited) are read, never written. Python >= 3.11, standard library only.
"""
import json, os, sys, tomllib
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lock  # noqa: E402
from books import BOOKS  # noqa: E402
from importers import osis, zefania, usfx, vpl, tagnt, morphhb, lexicons, fathers  # noqa: E402

ROOT = lock.ROOT
SOURCES = os.path.join(ROOT, "sources")
TEXT_IMPORTERS = {"osis": osis.read, "zefania": zefania.read, "usfx": usfx.read, "vpl": vpl.read}
ORDER = {b["code"]: b["ord"] for b in BOOKS}
written = []


def write(path, content):
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old != content:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        written.append(os.path.relpath(path, ROOT))


def tsv(header, rows):
    out = ["\t".join(header)]
    for r in rows:
        cells = [str(c) for c in r]
        if any("\t" in c or "\n" in c for c in cells):
            raise ValueError(f"tab or newline in a cell: {cells}")
        out.append("\t".join(cells))
    return "\n".join(out) + "\n"


def write_books(folder, header, rows, key):
    """rows: (code, ch, v, cells). One <BOOK>.tsv per book, rows in raw order; key(row) must be unique
    within a book: (ch, v) for texts, (ch, v, word[, alt ref]) for words."""
    by_book = OrderedDict()
    for code, ch, v, cells in rows:
        by_book.setdefault(code, []).append([ch, v] + (cells if isinstance(cells, list) else [cells]))
    for code, rs in by_book.items():
        keys = [key(r) for r in rs]
        dup = len(keys) - len(set(keys))
        if dup:
            raise ValueError(f"{folder}/{code}: {dup} duplicate references")
        write(os.path.join(folder, code + ".tsv"), tsv(header, rs))
    for f in os.listdir(folder):
        if f.endswith(".tsv") and f[:-4] not in by_book:
            os.remove(os.path.join(folder, f))
            written.append("removed " + os.path.relpath(os.path.join(folder, f), ROOT))
    return by_book


def manifest(folder):
    return tomllib.load(open(os.path.join(folder, "manifest.toml"), "rb"))


def main(args):
    if "--update-lock" in args:
        lock.update()
    problems = lock.verify()
    if problems:
        print("raw/ doesn't match sources/sources.lock.json:\n  " + "\n  ".join(problems))
        return 1
    report = []

    tdir = os.path.join(SOURCES, "translations")
    for tid in sorted(os.listdir(tdir)):
        folder = os.path.join(tdir, tid)
        m = manifest(folder)
        if m["importer"] == "live":
            report.append((m["abbrev"], "live (no stored text)", ""))
            continue
        rows, notes = TEXT_IMPORTERS[m["importer"]](os.path.join(ROOT, m["raw"]), set(m.get("exclude", [])))
        by_book = write_books(folder, ["chapter", "verse", "text"], [(c, ch, v, t) for c, ch, v, t in rows], lambda r: tuple(r[:2]))
        n = sum(len(r) for r in by_book.values())
        empty = sum(1 for _, _, _, t in rows if not t)
        v0 = sum(1 for _, _, v, _ in rows if v == 0)
        report.append((m["abbrev"], f"{len(by_book)} books, {n} verses ({empty} empty, {v0} verse-0 titles)", "; ".join(notes)))

    grc = manifest(os.path.join(SOURCES, "original", "grc"))
    rows, _ = tagnt.read([os.path.join(ROOT, p) for p in grc["raw"]])
    by_book = write_books(os.path.join(SOURCES, "original", "grc"), tagnt.COLUMNS, rows, lambda r: (r[0], r[1], r[2], r[-1]))  # TAGNT numbers words within the NRSV verse
    report.append(("grc", f"{len(by_book)} books, {len(rows)} words (all editions)", ""))
    hbo = manifest(os.path.join(SOURCES, "original", "hbo"))
    rows, notes = morphhb.read(os.path.join(ROOT, hbo["raw"]))
    by_book = write_books(os.path.join(SOURCES, "original", "hbo"), morphhb.COLUMNS, rows, lambda r: tuple(r[:3]))
    report.append(("hbo", f"{len(by_book)} books, {len(rows)} words", "; ".join(notes)))

    lm = manifest(os.path.join(SOURCES, "lexicon"))
    readers = {"tbesg": lexicons.read_tbesg, "hebrewstrong": lexicons.read_hebrewstrong}
    for lang in ("grc", "hbo"):
        entries = readers[lm[lang]["importer"]](os.path.join(ROOT, lm[lang]["raw"]))
        write(os.path.join(SOURCES, "lexicon", lang + ".jsonl"),
              "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in entries))
        report.append((f"lexicon {lang}", f"{len(entries)} entries", ""))

    fm = manifest(os.path.join(SOURCES, "commentary", "fathers"))
    authors, quotes, notes = fathers.read(os.path.join(ROOT, fm["raw"]))
    fdir = os.path.join(SOURCES, "commentary", "fathers")
    write(os.path.join(fdir, "authors.tsv"), tsv(["author", "year", "category", "condemned", "eligible"], authors))
    # one file per cited book (all quotes in one file would be ~90 MB, near GitHub's 100 MB file limit)
    qdir = os.path.join(fdir, "quotes")
    os.makedirs(qdir, exist_ok=True)
    by_book = OrderedDict()
    for q in quotes:
        by_book.setdefault(q["ref"].split()[0], []).append(q)
    for code, qs in by_book.items():
        write(os.path.join(qdir, code + ".jsonl"), "".join(json.dumps(q, ensure_ascii=False) + "\n" for q in qs))
    for f in os.listdir(qdir):
        if f[:-6] not in by_book:
            os.remove(os.path.join(qdir, f))
    unknown = notes["unknown books"]
    report.append(("fathers", f"{sum(a[4] == 'yes' for a in authors)} of {len(authors)} authors eligible, {len(quotes)} citations",
                   f"{sum(unknown.values())} files under {len(unknown)} other book names skipped; "
                   f"unreadable: {notes['unreadable files']} files, {notes['unreadable metadata']} metadata"))

    for name, what, note in report:
        print(f"{name:12} {what}" + (f"\n{'':12} {note}" if note else ""))
    print(f"\n{len(written)} files written" + (":\n  " + "\n  ".join(written[:10]) + ("\n  ..." if len(written) > 10 else "") if written else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

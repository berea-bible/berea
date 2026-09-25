"""Church-fathers corpus (HistoricalChristianFaith/Commentaries-Database): <author>/metadata.toml and
<author>/<Book> <ch>_<v1>[-<v2>].toml files holding [[commentary]] entries.

Authors are filtered to genuine early-church sources: not in an excluded category, not condemned by a
council, and dated no later than 800 AD. Refs are kept as the corpus cites them (its book name mapped to
our code, its own chapter/verse numbers); quotes are kept whole (the compiler truncates for display).
Authors, files and entries are visited in sorted order, so the output doesn't depend on the filesystem."""
import os, re, tomllib
from books import BY_FATHER

EXCLUDE_CATEGORIES = {"Canonical Scriptures", "Reformation & Modern", "Second Temple Judaism"}
YEAR_CAP = 800
VERSE_FILE = re.compile(r'^(?P<book>.+?) (?P<chap>\d+)_(?P<v1>\d+)(?:-(?P<v2>\d+))?\.toml$')


def read(root):
    authors, quotes, notes = [], [], {"unknown books": {}, "unreadable files": 0, "unreadable metadata": 0}
    for author in sorted(os.listdir(root)):
        mpath = os.path.join(root, author, "metadata.toml")
        if not os.path.isfile(mpath):
            continue
        try:
            meta = tomllib.load(open(mpath, "rb"))
        except Exception:
            notes["unreadable metadata"] += 1
            continue
        cat, year = meta.get("father_category", ""), meta.get("default_year")
        condemned = bool(meta.get("condemned_by_council"))
        eligible = cat not in EXCLUDE_CATEGORIES and not condemned and not (year is not None and year > YEAR_CAP)
        authors.append([author, "" if year is None else str(year), cat, "yes" if condemned else "", "yes" if eligible else "no"])
        if not eligible:
            continue
        files = []
        for fname in os.listdir(os.path.join(root, author)):
            m = VERSE_FILE.match(fname)
            if not m:
                continue
            b = BY_FATHER.get(m.group("book"))
            if not b:
                notes["unknown books"][m.group("book")] = notes["unknown books"].get(m.group("book"), 0) + 1
                continue
            v1 = int(m.group("v1"))
            files.append((b["ord"], int(m.group("chap")), v1, int(m.group("v2") or v1), fname, b["code"]))
        for _, ch, v1, v2, fname, code in sorted(files):
            try:
                data = tomllib.load(open(os.path.join(root, author, fname), "rb"))
            except Exception:
                notes["unreadable files"] += 1
                continue
            ref = f"{code} {ch}:{v1}" + (f"-{v2}" if v2 != v1 else "")
            for e in data.get("commentary", []):
                q = (e.get("quote") or "").strip()
                if q:
                    quotes.append({"author": author, "ref": ref, "quote": q,
                                   "source_title": e.get("source_title", ""), "source_url": e.get("source_url", "")})
    return authors, quotes, notes

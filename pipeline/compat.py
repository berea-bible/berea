#!/usr/bin/env python3
"""dist/ -> data/ in today's (pre-v2) format, so the app keeps working until it reads dist/ directly.
Deleted in phase 6 of docs/v2-plan.md, together with data/.

    python3 pipeline/compat.py [--out DIR]

Today's format keys everything by the KJV's own verse numbers (2 Esdras: the WEB's, which include the
7:36-105 fragment the KJV lacks). So each source's rows are placed through their pivots onto the base
translation's verse: several rows on one verse are joined in native order, a row covering several base
verses goes on the first, psalm-title verses (native verse 0) are left out of the text, and a title
the source numbers as verse 1 (DRA, Hebrew) is prefixed onto verse 1.
"""
import json, os, re, shutil, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from books import BOOKS, BY_CODE  # noqa: E402

ROOT = os.path.dirname(HERE)
CODES = ["KJV", "ASV", "WEB", "YLT", "DRA"]
BASE = {"2ES": "WEB"}                        # books today's data numbers by another translation
DC_TRANSLATIONS = ["KJV", "WEB", "DRA"]
DC_ORDER = ["1esd", "2esd", "tob", "jdt", "addesth", "wis", "sir", "bar", "prazar", "sus", "bel", "prman", "1macc", "2macc"]  # 1611 KJV order


def load(dist, *p):
    return json.load(open(os.path.join(dist, *p), encoding="utf-8"))


def dump(path, obj, indent=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, **({"indent": indent} if indent else {"separators": (",", ":")}))


def decode(v):
    return v >> 20, (v >> 10) & 1023, v & 1023


ORD = {b["ord"]: b["code"] for b in BOOKS}


def pivot_code(v):
    o, c, n = decode(v)
    return ORD[o], c, n


def rows_of(doc):
    """[(ch, v, text, [pivot (code, ch, v)])] of a text/<TR>/<BOOK>.json"""
    out = []
    for i, (r, t) in enumerate(zip(doc["ref"], doc["text"])):
        ch, v = divmod(r, 1000)
        ps = [pivot_code(x) for x in doc["pivot"][str(i)]] if str(i) in doc["pivot"] else [(doc["book"], ch, v)]
        out.append((ch, v, t, ps))
    return out


def app_key(code, ch, v):
    """A base translation's native verse -> today's (book id, ch, v)."""
    if code == "LJE":
        return ("bar", 6, v)
    return (BY_CODE[code]["app"], ch, v)


def main(dist, out):
    catalog = load(dist, "catalog.json")
    trs = catalog["translations"]
    # base verse of every pivot: KJV native numbering (WEB's for BASE books)
    base_of = {}
    for tr in ("KJV", "WEB"):
        for code in trs[tr]["books"]:
            if (BASE.get(code, "KJV") != tr):
                continue
            for ch, v, t, ps in rows_of(load(dist, "text", tr, code + ".json")):
                if v == 0:
                    continue
                for p in ps:
                    base_of.setdefault(p, app_key(code, ch, v))

    def key_of(p, own=None):
        if own is not None:
            return own
        if p[2] == 0:
            k = base_of.get((p[0], p[1], 1))
            return (k[0], k[1], 0) if k else None
        return base_of.get(p)

    apps = [b for b in BOOKS if b["app"]]
    docs = {b["app"]: {"id": b["app"], "name": b["name"], "translations": {c: {} for c in CODES}, "fathers": {}} for b in apps}
    for tr in CODES:
        placed = defaultdict(list)
        titles = {}
        for code in trs[tr]["books"]:
            own_base = BASE.get(code) == tr
            for ch, v, t, ps in rows_of(load(dist, "text", tr, code + ".json")):
                if v == 0 or not t:
                    continue                          # separate psalm titles / empty verses: not in today's data
                k = key_of(ps[0], app_key(code, ch, v) if own_base else None)
                if k is None:
                    continue
                if k[2] == 0:
                    titles[(k[0], k[1])] = t
                else:
                    placed[k].append(t)
        for (a, ch), t in titles.items():
            placed[(a, ch, 1)].insert(0, t)
        for (a, ch, v), ts in placed.items():
            docs[a]["translations"][tr].setdefault(ch, {})[v] = " ".join(ts)

    # original-language words
    originals = {}
    for lang in ("grc", "hbo"):
        tables = load(dist, "orig", lang, "tables.json")
        for code in catalog["original"][lang]["books"]:
            doc = load(dist, "orig", lang, code + ".json")
            words, titles = defaultdict(list), defaultdict(list)
            starts = doc["start"] + [len(doc["surface"])]
            for vi, r in enumerate(doc["ref"]):
                ch, v = divmod(r, 1000)
                for n in range(starts[vi], starts[vi + 1]):
                    p = pivot_code(doc["pivot"][str(n)]) if str(n) in doc["pivot"] else (code, ch, v)
                    k = key_of(p)
                    if k is None:
                        continue
                    w = {"g": doc["surface"][n], "s": doc["strong"][n].split("+") if doc["strong"][n] else [],
                         "m": tables["morph"][doc["morph"][n]], "gl": doc["gloss"][n],
                         "t": doc["translation"][n] if "translation" in doc else ""}
                    (titles[(k[0], k[1])] if k[2] == 0 else words[k]).append(w)
            for (a, ch), ws in titles.items():
                words[(a, ch, 1)] = ws + words[(a, ch, 1)]
            for (a, ch, v), ws in words.items():
                originals.setdefault(a, {}).setdefault(ch, {})[v] = ws

    # fathers: bodies keep their chapter files (renamed to today's book ids); index re-keyed
    fdir = os.path.join(dist, "comm", "fathers")
    file_key = lambda code, ch: ("bar", 6) if code == "LJE" else (BY_CODE[code]["app"], ch)
    n_quotes, authors = 0, set()
    for code in sorted(os.listdir(os.path.join(fdir, "body"))):
        for f in os.listdir(os.path.join(fdir, "body", code)):
            bodies = load(fdir, "body", code, f)
            n_quotes += len(bodies); authors.update(b["father"] for b in bodies)
            a, ch = file_key(code, int(f[:-5]))
            dump(os.path.join(out, "fathers", a, f"{ch}.json"), bodies)
    for f in sorted(os.listdir(os.path.join(fdir, "idx"))):
        code = f[:-5]
        for vs, refs in load(fdir, "idx", f).items():
            p = pivot_code(int(vs))
            k = key_of(p)
            new = []
            for r in refs:
                fb, fc, i = (p[0], p[1], r) if isinstance(r, int) else (r.split("/")[0], int(r.split("/")[1]), int(r.split("/")[2]))
                fa, fch = file_key(fb, fc)
                new.append(i if (fa, fch) == (k[0], k[1]) else f"{fa}/{fch}/{i}")
            docs[k[0]]["fathers"].setdefault(k[1], {})[k[2]] = new

    # lexicon (same format, today's paths)
    for lang, L in (("grc", "G"), ("hbo", "H")):
        os.makedirs(os.path.join(out, "lexicon", L), exist_ok=True)
        shutil.copyfile(os.path.join(dist, "lex", lang, "index.json"), os.path.join(out, "lexicon", f"index-{L}.json"))
        for f in os.listdir(os.path.join(dist, "lex", lang, "def")):
            shutil.copyfile(os.path.join(dist, "lex", lang, "def", f), os.path.join(out, "lexicon", L, f))

    # book files + index, in today's key order (numeric)
    num = lambda d: {str(k): d[k] for k in sorted(d)}
    index_books = []
    dc_ids = DC_ORDER
    for b in apps:
        a, doc = b["app"], docs[b["app"]]
        doc["translations"] = {c: {str(ch): num(vs) for ch, vs in sorted(t.items())} for c, t in doc["translations"].items()}
        doc["fathers"] = {str(ch): num(vs) for ch, vs in sorted(doc["fathers"].items())}
        dump(os.path.join(out, a + ".json"), doc)
        words = originals.get(a, {})
        dump(os.path.join(out, "original", a + ".json"), {str(ch): num(vs) for ch, vs in sorted(words.items())})
        base = doc["translations"][BASE.get(b["code"], "KJV")] if b["group"] != "dc" else None
        if b["group"] == "dc":
            chs = defaultdict(set)
            for c in DC_TRANSLATIONS:
                for ch, vs in doc["translations"][c].items():
                    chs[ch].update(vs)
            counts = {ch: len(chs[ch]) for ch in sorted(chs, key=int)}
        else:
            counts = {ch: len(vs) for ch, vs in base.items()}
        e = {"id": a, "name": b["name"], "chapters": len(counts), "verseCounts": counts,
             "fatherVerseCount": sum(len(vs) for vs in doc["fathers"].values())}
        if b["group"] == "dc":
            e["translations"] = [c for c in DC_TRANSLATIONS if doc["translations"][c]]
        index_books.append(e)
    order = [b["app"] for b in BOOKS if b["group"] == "ot"] + dc_ids + [b["app"] for b in BOOKS if b["group"] == "nt"]
    index_books.sort(key=lambda e: order.index(e["id"]))
    names = {c: trs[c]["name"] for c in CODES}
    index = {"translations": names, "ntOnlyTranslations": ["YLT"],
             "otBookIds": [b["app"] for b in BOOKS if b["group"] == "ot"], "books": index_books,
             "fatherAuthorCount": len(authors), "fatherQuoteCount": n_quotes,
             "deuterocanonicalBookIds": dc_ids, "lexiconBucketSize": catalog["lexicon"]["bucketSize"]}
    dump(os.path.join(out, "books-index.json"), index, indent=2)
    return 0


if __name__ == "__main__":
    a = sys.argv[1:]
    out = os.path.abspath(a[a.index("--out") + 1]) if "--out" in a else os.path.join(ROOT, "data")
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)
    sys.exit(main(os.path.join(ROOT, "dist"), out))

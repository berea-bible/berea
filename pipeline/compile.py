#!/usr/bin/env python3
"""sources/ -> dist/: the runtime layer, keyed by the shared verse ID (see docs/v2-plan.md §4, §6).

    python3 pipeline/compile.py

Writes (into dist.tmp/, swapped in only when there are no errors):
  catalog.json                          books, canon profiles, translations (native books, the pivot
                                        books they cover, the profiles they show in), originals, lexicons
  text/<TR>/<BOOK>.json                 {book, ref: [ch*1000+v], text, pivot: {row: [vid, ...]}} (sparse)
  text/<TR>/absent.json                 {vid: "variant" | "empty" | "recension" | "missing"}
  text/<TR>/pivots.json                 live translations only: {BOOK: {ref: [vid, ...]}} (sparse)
  orig/{grc,hbo}/<BOOK>.json            columnar tokens (per-token pivot, sparse)
  orig/{grc,hbo}/tables.json            morphology (and Greek edition) strings the token files index
  lex/{grc,hbo}/index.json, def/<n>.json      the step-1 lexicon format
  comm/fathers/idx/<BOOK>.json          {vid: [ref, ...]}; ref = index into this vid's chapter file, or
                                        "BOOK/ch/i" for a quote stored with another chapter
  comm/fathers/body/<BOOK>/<ch>.json    [{father, quote, source_title, source_url}] (each quote once)
  validation.json                       {source: {errors, warnings}}; any error fails the build
  versification.txt                     every renumbering decision, by source / book / chapter
Standard library only; the output is deterministic.
"""
import json, os, re, shutil, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sources, tvtms  # noqa: E402
from books import BOOKS, BY_CODE, vid  # noqa: E402

ROOT = sources.ROOT
QUOTE_CAP = 900
LEX_BUCKET = 500
ATNACH = "֑"
OT = [b["code"] for b in BOOKS if b["group"] == "ot"]
NT = [b["code"] for b in BOOKS if b["group"] == "nt"]
CATHOLIC_DC = ["TOB", "JDT", "ADE", "WIS", "SIR", "BAR", "LJE", "S3Y", "SUS", "BEL", "1MA", "2MA"]
PROFILES = {
    "protestant": OT + NT,
    "catholic": OT + CATHOLIC_DC + NT,
    "orthodox": OT + CATHOLIC_DC + ["1ES", "2ES", "MAN", "ESG"] + NT,
}


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))


def ref_int(ch, v):
    return ch * 1000 + v


def vid_of(p):
    return vid(*p)


def flat(parts):
    return list(dict.fromkeys(p for _, ps in parts for p in ps))


def ranges(keys):
    """[(book, ch, v)] -> 'BOOK c:v-w, c:x' grouped compactly"""
    out, last = [], None
    for b, c, v in sorted(keys, key=lambda k: (BY_CODE[k[0]]["ord"], k[1], k[2])):
        if last and last[0] == b and last[1] == c and last[3] == v - 1:
            last[3] = v
        else:
            last = [b, c, v, v]
            out.append(last)
    return ", ".join(f"{b} {c}:{a}" + (f"-{z}" if z != a else "") for b, c, a, z in out)


class Report:
    def __init__(self):
        self.validation = {}
        self.lines = []

    def src(self, name):
        return self.validation.setdefault(name, {"errors": [], "warnings": []})

    def errors(self):
        return sum(len(v["errors"]) for v in self.validation.values())


def decisions_text(name, mapping, decisions, overrides, maps):
    lines = [f"== {name}: {len(mapping)} native verses, "
             f"{sum(1 for k, p in mapping.items() if flat(p) != [k])} not on the same-numbered pivot"]
    by = defaultdict(list)
    for d in decisions:
        by[(d["ref"][0], d["ref"][1])].append(d)
    for (b, c) in sorted(by, key=lambda k: (BY_CODE[k[0]]["ord"], k[1])):
        items = []
        for d in by[(b, c)]:
            tgt = ", ".join(f"{p[0]} {p[1]}:{p[2]}" if p[0] != b else f"{p[1]}:{p[2]}" for p in d["pivots"]) or "dropped"
            s = f"{d['ref'][1]}:{d['ref'][2]} -> {tgt}"
            if d["how"] == "word-count":
                s += f"  [WORD-COUNT; alternatives: {'; '.join(d['alternatives'])}]"
            elif d["how"] in ("map", "override"):
                s += f"  [{d['how']}]"
            items.append(s)
        lines.append(f"  {b} {c}: " + " | ".join(items))
    return lines


# ---------------------------------------------------------------- translations
def compile_translations(out, table, mapper, report, universe):
    catalog, kjv_mapping = {}, None
    for tid in sources.translation_ids():
        m, books = sources.translation(tid)
        name = m["abbrev"]
        rec = set(m.get("recension", []))
        entry = {"name": m["name"], "abbrev": name, "language": m.get("language", ""), "license": m.get("license", "")}
        if m["importer"] == "live":
            entry["live"] = True
            explicit, _ = tvtms.expand_maps(m.get("map", []))
            pivots = defaultdict(dict)
            for (b, c, v), ps in sorted(explicit.items()):
                pivots[b][str(ref_int(c, v))] = [vid_of(p) for p in ps]
            dump(os.path.join(out, "text", name, "pivots.json"), pivots)
            entry["books"] = {b: {"pivots": [b], "nav": [p for p, bs in PROFILES.items() if b in bs]} for b in OT + NT}
            report.lines += [f"== {name}: live, identity except {len(explicit)} mapped verses"]
            catalog[name] = entry
            continue
        native = {(b, c, v): len(t.split()) for b, rows in books.items() if b not in rec for c, v, t in rows}
        mapping, decisions, errors = mapper.map_source(name, native, m.get("override", []), m.get("map", []))
        rv = report.src(name)
        rv["errors"] += errors
        if name == "KJV":
            kjv_mapping = mapping
            for parts in mapping.values():
                for p in flat(parts):
                    universe.add(p)
        report.lines += decisions_text(name, mapping, decisions, m.get("override", []), m.get("map", []))
        report.lines += [f"  word-count decisions: {sum(d['how'] == 'word-count' for d in decisions)}"]
        rv["warnings"] += [f"word-count decision {tvtms.fmt(d['ref'])} -> {tvtms.fmt_list(d['pivots'])} "
                           f"(alternatives: {'; '.join(d['alternatives'])})" for d in decisions if d["how"] == "word-count"]
        text = {(b, c, v): t for b, rows in books.items() for c, v, t in rows}
        entry["books"] = {}
        covered_text, covered_empty = set(), set()
        for b, rows in books.items():
            if b in rec:
                continue
            refs, texts, piv = [], [], {}
            pbooks = []
            for i, (c, v, t) in enumerate(rows):
                ps = flat(mapping.get((b, c, v), []))
                refs.append(ref_int(c, v)); texts.append(t)
                if ps != [(b, c, v)]:
                    piv[str(i)] = [vid_of(p) for p in ps]
                (covered_text if t else covered_empty).update(ps)
                for p in ps:
                    if p[0] not in pbooks:
                        pbooks.append(p[0])
            chapters = list(dict.fromkeys(c for c, v, t in rows))
            pbooks.sort(key=lambda x: BY_CODE[x]["ord"])
            dump(os.path.join(out, "text", name, b + ".json"), {"book": b, "ref": refs, "text": texts, "pivot": piv})
            vis = {p for c, v, t in rows if t for p in flat(mapping.get((b, c, v), [])) if p}
            entry["books"][b] = {"chapters": chapters, "pivots": pbooks,
                                 "nav": [p for p, bs in PROFILES.items() if any(x[0] in bs for x in vis)]}
        entry["_covered"] = (covered_text, covered_empty, rec)
        catalog[name] = entry
    return catalog, kjv_mapping


def write_absent(out, catalog, table, report, universe):
    by_book = defaultdict(set)
    for p in universe:
        by_book[p[0]].add(p)
    for name, entry in catalog.items():
        if entry.get("live"):
            continue
        covered_text, covered_empty, rec = entry.pop("_covered")
        pbooks = {p[0] for p in covered_text | covered_empty}
        absent, missing = {}, []
        for b in sorted(pbooks | rec, key=lambda x: BY_CODE[x]["ord"]):
            for p in sorted(by_book[b]):
                if p in covered_text:
                    continue
                if b in rec:
                    reason = "recension"
                elif p in covered_empty:
                    reason = "empty"
                elif p in table.if_empty:
                    reason = "variant"
                else:
                    reason = "missing"
                    missing.append(p)
                absent[str(vid_of(p))] = reason
        dump(os.path.join(out, "text", name, "absent.json"), absent)
        titles = [p for p in missing if p[2] == 0]
        other = [p for p in missing if p[2] != 0]
        rv = report.src(name)
        if titles:
            rv["warnings"].append(f"{len(titles)} psalm titles (verse 0) missing: the source has no separate superscriptions"
                                  if len(titles) > 100 else f"psalm titles missing: {ranges(titles)}")
        if other:
            rv["warnings"].append(f"{len(other)} verses missing (no text on these pivots): {ranges(other)}")
        entry["absent"] = {r: sum(1 for x in absent.values() if x == r) for r in ("variant", "empty", "recension", "missing")}


# ---------------------------------------------------------------- original languages
def kjv_ref(ch, v, alt):
    """The KJV-numbered verse of a TAGNT word: the [bracket] ref, else the primary (NRSV) one."""
    if not alt:
        return ch, v
    m = re.match(r"(\d+)\.(\d+)(?:([\[\{\(])(\d+)\.(\d+))?", alt)
    if m.group(3) == "[":
        return int(m.group(4)), int(m.group(5))
    return int(m.group(1)), int(m.group(2))


def compile_original(out, lang, mapper, kjv_mapping, lexicon, report):
    m, books = sources.original(lang)
    native = {(b, c, v): len(ws) for b, vs in books.items() for (c, v), ws in vs.items()}
    mapping, decisions, errors = mapper.map_source(lang, native, m.get("override", []), m.get("map", []))
    rv = report.src(lang)
    rv["errors"] += errors
    report.lines += decisions_text(lang, mapping, decisions, m.get("override", []), m.get("map", []))
    rv["warnings"] += [f"word-count decision {tvtms.fmt(d['ref'])} -> {tvtms.fmt_list(d['pivots'])} "
                       f"(alternatives: {'; '.join(d['alternatives'])})" for d in decisions if d["how"] == "word-count"]
    kjv_pivot = {k: flat(p)[0] for k, p in kjv_mapping.items() if flat(p)}
    morphs = sorted({w["morph"] for vs in books.values() for ws in vs.values() for w in ws})
    morph_i = {x: i for i, x in enumerate(morphs)}
    tables = {"morph": morphs}
    if lang == "grc":
        eds = sorted({w["editions"] for vs in books.values() for ws in vs.values() for w in ws})
        ed_i = {x: i for i, x in enumerate(eds)}
        tables["editions"] = eds
    boundary, off, split_notes = 0, [], defaultdict(int)
    for b, verses in books.items():
        cols = defaultdict(list)
        refs, starts, piv = [], [], {}
        for (c, v), ws in verses.items():
            refs.append(ref_int(c, v)); starts.append(len(cols["surface"]))
            parts = mapping.get((b, c, v), [])
            verse_pivots = flat(parts)
            if lang == "grc":
                # per word: TAGNT's own KJV reference (finer than TVTMS's verse-level mapping)
                pivots = []
                for w in ws:
                    kc, kv = kjv_ref(int(w["chapter"]), int(w["verse"]), w["alt"])
                    p = kjv_pivot.get((b, kc, kv), (b, kc, kv))
                    pivots.append(p)
                    if p not in verse_pivots:
                        near = any(q[0] == p[0] and (q[1] == p[1] and abs(q[2] - p[2]) == 1 or q[1] != p[1]) for q in verse_pivots)
                        if near:
                            boundary += 1
                        else:
                            off.append((b, c, v, p))
            else:
                if len(parts) == 1 or not parts:
                    ps = parts[0][1] if parts else [(b, c, v)]
                    if len(ps) > 1:
                        split_notes["one verse on several pivots (words go to the first)"] += 1
                    pivots = [ps[0]] * len(ws)
                else:
                    pm = dict(parts)
                    if sorted(pm) != ["a", "b"]:
                        rv["errors"].append(f"{b} {c}:{v}: can't split words into parts {sorted(pm)}"); continue
                    idx = next((i for i, w in enumerate(ws) if ATNACH in w["surface"]), len(ws) // 2 - 1)
                    pivots = [pm["a"][0]] * (idx + 1) + [pm["b"][0]] * (len(ws) - idx - 1)
                    split_notes["half verses split at the atnach"] += 1
            for i, (w, p) in enumerate(zip(ws, pivots)):
                n = len(cols["surface"])
                if p != (b, c, v):
                    piv[str(n)] = vid_of(p)
                cols["surface"].append(w["surface"])
                cols["morph"].append(morph_i[w["morph"]])
                if lang == "grc":
                    sl = [s for s in (re.sub(r"[A-Z]$", "", s) for s in w["strongs"].split("+")) if re.match(r"^G\d+$", s)]
                    cols["strong"].append("+".join(sl))
                    cols["gloss"].append(w["gloss"]); cols["translit"].append(w["translit"])
                    cols["translation"].append(w["translation"]); cols["editions"].append(ed_i[w["editions"]])
                else:
                    sl = sources.hebrew_strongs(w["lemma"])
                    cols["strong"].append("+".join(sl))
                    cols["lemma"].append(w["lemma"])
                    cols["gloss"].append(lexicon.get(sl[-1], {}).get("gloss", ""))
        dump(os.path.join(out, "orig", lang, b + ".json"), {"book": b, "ref": refs, "start": starts, "pivot": piv, **cols})
    dump(os.path.join(out, "orig", lang, "tables.json"), tables)
    if lang == "grc":
        rv["warnings"].append(f"{boundary} words sit on the neighbouring pivot verse of their NA verse (TAGNT's KJV "
                              f"verse division, e.g. 1 John 2:13-14)")
        for b, c, v, p in off:
            rv["errors"].append(f"{b} {c}:{v}: a word's KJV reference {tvtms.fmt(p)} is outside the verse's mapping")
    for k, n in split_notes.items():
        rv["warnings"].append(f"{n} {k}")
    return {"name": m["name"], "license": m["license"], "books": list(books)}


def compile_lexicons(out):
    info = {"bucketSize": LEX_BUCKET}
    hebrew = {}
    for lang in ("grc", "hbo"):
        m = sources.manifest("lexicon")[lang]
        entries = sources.lexicon(lang)
        index, buckets = {}, defaultdict(dict)
        for e in entries:
            index[e["id"]] = [e["lemma"], e["translit"], e["gloss"], e["pos"]]
            buckets[int(re.sub(r"\D", "", e["id"])) // LEX_BUCKET][e["id"]] = e["definition"]
            if lang == "hbo":
                hebrew[e["id"]] = e
        dump(os.path.join(out, "lex", lang, "index.json"), index)
        for n, defs in sorted(buckets.items()):
            dump(os.path.join(out, "lex", lang, "def", f"{n}.json"), defs)
        info[lang] = {"name": m["name"], "license": m["license"], "entries": len(entries)}
    return info, hebrew


# ---------------------------------------------------------------- fathers
def truncate(q):
    q = q.strip()
    return q if len(q) <= QUOTE_CAP else q[:QUOTE_CAP].rsplit(" ", 1)[0] + "…"


def compile_fathers(out, universe, report):
    m, authors, quotes = sources.fathers()
    rv = report.src("fathers")
    by_string = {mp["from"]: mp for mp in m.get("map", [])}
    verse_maps = [mp for mp in m.get("map", []) if isinstance(safe_range(mp["from"]), list) and safe_range(mp["from"])]
    explicit, dropped = tvtms.expand_maps(verse_maps)
    cites = defaultdict(list)            # pivot -> [quote index]
    used_maps, dropped_n = set(), 0
    for qi, q in enumerate(quotes):
        ref = q["ref"]
        if ref in by_string and not safe_range(ref):
            used_maps.add(ref)
            ref = by_string[ref]["to"]
            if ref == "drop":
                dropped_n += 1; continue
        mm = re.match(r"^(\S+) (\d+):(\d+)(?:-(\d+))?$", ref)
        b, c, v1, v2 = mm.group(1), int(mm.group(2)), int(mm.group(3)), int(mm.group(4) or mm.group(3))
        if v2 < v1:
            rv["errors"].append(f"{q['author']}: {q['ref']}: backwards range (add a [[map]] for it)"); continue
        for v in range(v1, v2 + 1):
            k = (b, c, v)
            if k in dropped:
                dropped_n += 1; continue
            ps = explicit.get(k) or [(tvtms.pivot_book(b, c, v), c, v)]
            for p in ps:
                if p not in universe:
                    rv["errors"].append(f"{q['author']}: {q['ref']}: {tvtms.fmt(p)} is not a verse"); continue
                if qi not in cites[p]:
                    cites[p].append(qi)
    home, files, idx = {}, defaultdict(list), defaultdict(dict)
    for p in sorted(cites, key=lambda k: (BY_CODE[k[0]]["ord"], k[1], k[2])):
        refs = []
        for qi in cites[p]:
            q = quotes[qi]
            body = {"father": q["author"], "quote": truncate(q["quote"]), "source_title": q["source_title"], "source_url": q["source_url"]}
            key = (body["father"], body["source_title"], body["quote"])
            if key not in home:
                files[(p[0], p[1])].append(body)
                home[key] = (p[0], p[1], len(files[(p[0], p[1])]) - 1)
            hb, hc, hi = home[key]
            r = hi if (hb, hc) == (p[0], p[1]) else f"{hb}/{hc}/{hi}"
            if r not in refs:
                refs.append(r)
        idx[p[0]][str(vid_of(p))] = refs
    for (b, c), bodies in files.items():
        dump(os.path.join(out, "comm", "fathers", "body", b, f"{c}.json"), bodies)
    for b, entries in idx.items():
        dump(os.path.join(out, "comm", "fathers", "idx", b + ".json"), entries)
    rv["warnings"].append(f"{dropped_n} citation-verse links dropped by [[map]] to = \"drop\"")
    return {"name": m["name"], "quotes": len(home), "authors": len({k[0] for k in home}),
            "verses": {b: len(e) for b, e in sorted(idx.items(), key=lambda x: BY_CODE[x[0]]["ord"])}}


def safe_range(s):
    try:
        return tvtms.parse_range(s)
    except ValueError:
        return None


# ---------------------------------------------------------------- main
def main():
    tmp = os.path.join(ROOT, "dist.tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    report = Report()
    _, kjv_books = sources.translation("kjv")
    table = tvtms.Table(os.path.join(ROOT, "raw", "tvtms.txt"),
                        [(tvtms.native_to_tv(b, c), c, v) for b, rows in kjv_books.items() for c, v, _ in rows])
    mapper = tvtms.Mapper(table)
    universe = set()
    translations, kjv_mapping = compile_translations(tmp, table, mapper, report, universe)
    write_absent(tmp, translations, table, report, universe)
    lex_info, hebrew_lex = compile_lexicons(tmp)
    original = {lang: compile_original(tmp, lang, mapper, kjv_mapping, hebrew_lex, report) for lang in ("grc", "hbo")}
    fathers = compile_fathers(tmp, universe, report)
    catalog = {
        "vid": {"book": 2 ** 20, "chapter": 2 ** 10},
        "books": [{"code": b["code"], "ord": b["ord"], "group": b["group"], "name": b["name"]} for b in BOOKS],
        "profiles": PROFILES,
        "translations": translations,
        "original": original,
        "lexicon": lex_info,
        "commentary": {"fathers": fathers},
    }
    dump(os.path.join(tmp, "catalog.json"), catalog)
    with open(os.path.join(tmp, "validation.json"), "w", encoding="utf-8") as fh:
        json.dump(report.validation, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(tmp, "versification.txt"), "w", encoding="utf-8") as fh:
        fh.write("Versification decisions: native verse -> pivot (TVTMS Standard = KJV numbering).\n"
                 "Only verses that don't land on the same-numbered pivot, plus word-count decisions, are listed.\n\n")
        fh.write("\n".join(report.lines) + "\n")
    n_err = report.errors()
    for name, v in report.validation.items():
        print(f"{name:8} errors {len(v['errors']):4}  warnings {len(v['warnings']):4}")
        for e in v["errors"][:10]:
            print("    E", e)
    if n_err:
        print(f"\nFAIL: {n_err} errors (see dist.tmp/validation.json); dist/ was not changed")
        return 1
    dist = os.path.join(ROOT, "dist")
    shutil.rmtree(dist, ignore_errors=True)
    os.replace(tmp, dist)
    n = sum(len(fs) for _, _, fs in os.walk(dist))
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(dist) for f in fs)
    print(f"\ndist/ written: {n} files, {size / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

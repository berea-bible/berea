"""Lexicons -> {id, lemma, translit, pos, gloss, definition} entries, in source order.

tbesg: STEPBible TBESG (Greek). One entry per Strong's number (the first line for it wins, as before).
hebrewstrong: openscriptures HebrewLexicon/HebrewStrong.xml (Hebrew/Aramaic Strong's)."""
import html, re


def _strip_greek_def(s):
    s = s.replace("<BR />", "\n").replace("<BR/>", "\n").replace("<br />", "\n")
    s = re.sub(r"<ref='[^']*'>([^<]*)</ref>", r"\1", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def read_tbesg(path):
    out, seen = [], set()
    for line in open(path, encoding="utf-8", errors="replace"):
        if not line.startswith("G"):
            continue
        parts = line.rstrip("\n").split("\t")
        sid = parts[0].strip()
        if len(parts) < 8 or not re.match(r"^G\d+$", sid) or sid in seen:
            continue
        seen.add(sid)
        out.append({"id": sid, "lemma": parts[3].strip(), "translit": parts[4].strip(), "pos": parts[5].strip(),
                    "gloss": parts[6].strip(), "definition": _strip_greek_def(parts[7])})
    return out


def _strip_hebrew_def(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def read_hebrewstrong(path):
    txt = open(path, encoding="utf-8").read()
    out = []
    for em in re.finditer(r'<entry id="(H\d+)">(.*?)</entry>', txt, re.S):
        sid, body = em.group(1), em.group(2)
        wm = re.search(r'<w pos="([^"]*)"[^>]*pron="([^"]*)"[^>]*xlit="([^"]*)"[^>]*>([^<]*)</w>', body)
        gm = re.search(r'<meaning>(.*?)</meaning>', body, re.S)
        gloss = ""
        if gm:
            dm = re.search(r'<def>(.*?)</def>', gm.group(1), re.S)
            gloss = _strip_hebrew_def(dm.group(1)) if dm else _strip_hebrew_def(gm.group(1))
        um = re.search(r'<usage>(.*?)</usage>', body, re.S)
        definition = _strip_hebrew_def(um.group(1)) if um else ""
        src = re.search(r'<source>(.*?)</source>', body, re.S)
        note = _strip_hebrew_def(src.group(1)) if src else ""
        full = (definition + ("\n" + note if note else "")).strip()
        out.append({"id": sid, "lemma": wm.group(4) if wm else "", "translit": wm.group(3) if wm else "",
                    "pos": wm.group(1) if wm else "", "gloss": gloss or definition[:60],
                    "definition": full or definition})
    return out

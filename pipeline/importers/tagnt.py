"""STEPBible TAGNT (Translators Amalgamated Greek NT): one row per word, every edition's words kept.

A word row's reference is NRSV versification, with a differing KJV ref in [brackets], NA in (parens) and
others in {braces}, e.g. "Rom.16.25{14.24}#01=NKO", "3Jn.1.15[1.14]#08=NKO", "Mrk.12.15(12.14)#01=NKO".
The native numbering here is Nestle-Aland's: the (NA) ref when present, else the primary one. When a row
has an alternate ref, `alt` keeps the whole raw ref ("12.15(12.14)"); `word` numbers within the primary
(NRSV) verse, so it is unique only together with `alt`.

Word type (after "="): N = NA/SBL text, K = KJV/TR text, O = other editions; lower case marks a minor
difference, parentheses a variant. Which words are shown is the compiler's choice, not the importer's."""
import re
from books import BY_TAGNT
from . import book_code

REF = re.compile(r"^([1-3A-Z][A-Za-z0-9]{2})\.(\d+)\.(\d+)((?:\[|\{|\()(\d+)\.(\d+)[\]\}\)])?#(\d+)=(\S+)$")
COLUMNS = ["chapter", "verse", "word", "type", "surface", "translit", "strongs", "morph", "lemma", "gloss",
           "translation", "editions", "alt"]


def read(paths, exclude=()):
    rows, notes, unparsed = [], [], 0
    for path in paths:
        for line in open(path, encoding="utf-8"):
            parts = line.rstrip("\n").split("\t")
            m = REF.match(parts[0])
            if not m:
                if re.match(r"^[1-3A-Z][A-Za-z0-9]{2}\.\d+\.\d+", parts[0]):
                    unparsed += 1
                continue
            if len(parts) < 6:
                raise ValueError(f"tagnt: short row {parts[0]}")
            code = book_code(BY_TAGNT, m.group(1), exclude, "tagnt")
            ch, v = int(m.group(2)), int(m.group(3))
            alt = f"{ch}.{v}{m.group(4)}" if m.group(4) else ""
            if m.group(4) and m.group(4).startswith("("):
                ch, v = int(m.group(5)), int(m.group(6))
            sm = re.match(r"^(.*?)\s*\(([^()]*)\)$", parts[1].strip())
            surface, translit = (sm.group(1), sm.group(2)) if sm else (parts[1].strip(), "")
            strongs, _, morph = parts[3].strip().partition("=")
            lemma, _, gloss = parts[4].strip().partition("=")
            rows.append((code, ch, v, [int(m.group(7)), m.group(8), surface, translit, strongs, morph, lemma,
                                       gloss, parts[2].strip(), parts[5].strip(), alt]))
    if unparsed:
        raise ValueError(f"tagnt: {unparsed} word rows with an unrecognised reference")
    return rows, notes

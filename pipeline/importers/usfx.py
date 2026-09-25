"""USFX (open-bibles eng-web.usfx.xml): <book id="MAT">...<c id="1"/><v id="1"/>text<ve/>...

Footnotes (<f>) and cross-references (<x>) are removed. A <d> superscription between a chapter's start and
its first verse becomes verse 0. Psalm 119's stanza letters (<d>ALEPH</d>, ...) are headings, not
verse text, and are dropped, as before. <vp> (a printed verse number differing from the id, e.g. S3Y 1:55-56) is dropped from the text;
the id is the verse number. WEB's deuterocanonical books mark plural "you" as "you⌃"; the marker is
removed. Front/back matter (FRT, GLO) is not scripture and is skipped."""
import re
from books import BY_CODE
from . import clean, book_code

NOT_SCRIPTURE = {"FRT", "GLO"}
ACROSTIC = re.compile(r"^[A-Z]+( AND [A-Z]+)?$")   # Psalm 119 stanza letters: "ALEPH", "SIN AND SHIN"


def read(path, exclude=()):
    txt = open(path, encoding="utf-8").read()
    rows, notes = [], []
    for bm in re.finditer(r'<book id="([A-Z0-9]+)">(.*?)</book>', txt, re.S):
        if bm.group(1) in NOT_SCRIPTURE:
            continue
        code = book_code(BY_CODE, bm.group(1), exclude, "usfx")
        if code is None:
            notes.append(f"excluded {bm.group(1)}"); continue
        body = re.sub(r"<f[ >].*?</f>", "", bm.group(2), flags=re.S)
        body = re.sub(r"<x[ >].*?</x>", "", body, flags=re.S)
        body = re.sub(r"<vp>.*?</vp>", "", body, flags=re.S)
        ch = vs = None
        buf, first_in_chapter = [], False

        def text():
            return clean(re.sub(r"<[^>]+>", " ", "".join(buf))).replace("⌃", "")

        for tok in re.split(r'(<c id="\d+"/>|<v id="\d+"/>|<ve/>)', body):
            cm, vm = re.match(r'<c id="(\d+)"/>', tok), re.match(r'<v id="(\d+)"/>', tok)
            if cm or vm or tok == "<ve/>":
                if ch and vs:
                    rows.append((code, ch, vs, text()))
                elif vm and first_in_chapter:
                    d = re.findall(r"<d>(.*?)</d>", "".join(buf), re.S)
                    if d and not ACROSTIC.match(clean(" ".join(d))):
                        rows.append((code, ch, 0, clean(re.sub(r"<[^>]+>", " ", " ".join(d)))))
                buf = []
                if cm:
                    ch, vs, first_in_chapter = int(cm.group(1)), None, True
                elif vm:
                    vs, first_in_chapter = int(vm.group(1)), False
                else:
                    vs = None
            else:
                buf.append(tok)
        if ch and vs:
            rows.append((code, ch, vs, text()))
    return rows, notes

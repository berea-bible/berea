"""Open Scriptures Hebrew Bible (morphhb, WLC): wlc/<OSIS>.xml, <verse osisID="Gen.1.1"><w lemma=".."
morph=".." id="..">text</w>... Native (Hebrew) numbering: psalm titles are verse 1 (or 1-2).

Every <w> is kept, including ketiv forms (type="x-ketiv"); `word` is its position in the verse.
Large/small-letter <seg> marks inside a word are dropped (the letter stays)."""
import html, os, re
from books import BOOKS

COLUMNS = ["chapter", "verse", "word", "type", "surface", "lemma", "morph", "id"]


def read(wlc_dir, exclude=()):
    rows, notes = [], []
    for b in BOOKS:
        if b["group"] != "ot" or b["code"] in exclude:
            continue
        txt = open(os.path.join(wlc_dir, b["osis"] + ".xml"), encoding="utf-8").read()
        for vm in re.finditer(rf'<verse osisID="{re.escape(b["osis"])}\.(\d+)\.(\d+)"[^>]*>(.*?)</verse>', txt, re.S):
            n = 0
            for wm in re.finditer(r"<w ([^>]*)>(.*?)</w>", vm.group(3), re.S):
                inner = re.sub(r'</?seg[^>]*>', '', wm.group(2))    # large/small letters, e.g. Lev 11:42
                if "<" in inner:
                    raise ValueError(f"morphhb: markup inside a word at {b['code']} {vm.group(1)}:{vm.group(2)}")
                attrs = dict(re.findall(r'(\w+)="([^"]*)"', wm.group(1)))
                surface = html.unescape(inner).strip()
                if not surface:
                    notes.append(f"empty word skipped: {b['code']} {vm.group(1)}:{vm.group(2)}"); continue
                n += 1
                rows.append((b["code"], int(vm.group(1)), int(vm.group(2)),
                             [n, attrs.get("type", ""), surface, attrs.get("lemma", ""), attrs.get("morph", ""), attrs.get("id", "")]))
    return rows, notes

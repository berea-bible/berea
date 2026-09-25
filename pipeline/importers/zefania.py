"""Zefania XML (open-bibles ASV, YLT): <BIBLEBOOK bname=".."><CHAPTER cnumber="N"><VERS vnumber="M">text</VERS>."""
import re
from books import BY_ZEF
from . import clean, strip_tags, book_code


def read(path, exclude=()):
    txt = open(path, encoding="utf-8").read()
    rows, notes = [], []
    for bm in re.finditer(r'<BIBLEBOOK bnumber="\d+" bname="([^"]*)"[^>]*>(.*?)</BIBLEBOOK>', txt, re.S):
        code = book_code(BY_ZEF, bm.group(1), exclude, "zefania")
        if code is None:
            notes.append(f"excluded {bm.group(1)}"); continue
        for cm in re.finditer(r'<CHAPTER cnumber="(\d+)">(.*?)</CHAPTER>', bm.group(2), re.S):
            for vm in re.finditer(r'<VERS vnumber="(\d+)"[^>]*>(.*?)</VERS>', cm.group(2), re.S):
                rows.append((code, int(cm.group(1)), int(vm.group(1)), clean(strip_tags(vm.group(2)))))
    return rows, notes

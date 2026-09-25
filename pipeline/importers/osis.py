"""KJV OSIS (open-bibles eng-kjv.osis.xml): milestone verses <verse osisID="Matt.1.1" sID=.../>...<verse eID=.../>.

Psalm superscriptions (<title type="psalm"> before a chapter's first verse) become verse 0. Psalm 119's
stanza headings ("ALEPH.") are the same element between verses; they are not verse text and are dropped."""
import re
from books import BY_OSIS
from . import clean, strip_tags, book_code

ACROSTIC = re.compile(r"^[A-Z]+\.?$")


def read(path, exclude=()):
    txt = open(path, encoding="utf-8").read()
    rows, notes = [], []
    starts = [(m.start(), m.group(1)) for m in re.finditer(r'<div type="book" osisID="([^"]+)"', txt)]
    for i, (at, osis) in enumerate(starts):
        code = book_code(BY_OSIS, osis, exclude, "osis")
        body = txt[at:starts[i + 1][0] if i + 1 < len(starts) else len(txt)]
        if code is None:
            notes.append(f"excluded {osis}"); continue
        events = []
        for m in re.finditer(rf'<verse osisID="{re.escape(osis)}\.(\d+)\.(\d+)"[^/]*/>(.*?)(?=<verse |<chapter |</div>)', body, re.S):
            events.append((m.start(), int(m.group(1)), int(m.group(2)), clean(strip_tags(m.group(3)))))
        seen_first = set()
        verse_at = {(c, v): p for p, c, v, _ in events}
        for m in re.finditer(r'<title type="psalm"[^>]*>(.*?)</title>', body, re.S):
            text = clean(strip_tags(m.group(1)))
            nxt = re.compile(rf'<verse osisID="{re.escape(osis)}\.(\d+)\.(\d+)"').search(body, m.end())
            c, v = int(nxt.group(1)), int(nxt.group(2))
            if ACROSTIC.match(text):
                continue
            if v != 1:
                notes.append(f"{code} {c}:{v}: psalm title not before verse 1, dropped: {text[:40]}"); continue
            if c in seen_first:
                raise ValueError(f"{code} {c}: two psalm titles")
            seen_first.add(c)
            events.append((m.start(), c, 0, text))
        events.sort()
        rows.extend((code, c, v, t) for _, c, v, t in events)
    return rows, notes

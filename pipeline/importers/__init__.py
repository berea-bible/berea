"""Importers: raw/ -> sources/. Each reads one upstream format and returns rows in the source's own
(native) numbering, in the order the raw file has them. Nothing is renumbered here; versification is
the compiler's job."""
import html, re


def clean(txt):
    """Collapse whitespace and unescape entities (the same cleaning the pre-v2 data used)."""
    txt = re.sub(r"\s+", " ", txt).strip()
    return html.unescape(txt)


def strip_tags(s, sep=""):
    return re.sub(r"<[^>]+>", sep, s)


class UnknownBook(Exception):
    pass


def book_code(table, name, exclude, source):
    """Map a source's book id to our code; None for books the manifest excludes."""
    if name in exclude:
        return None
    b = table.get(name)
    if not b:
        raise UnknownBook(f"{source}: unknown book {name!r} (add it to books.py or the manifest's exclude list)")
    return b["code"]

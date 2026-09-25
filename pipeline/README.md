# pipeline/

Offline data tooling. Nothing here is served or needed by the app. Python 3, standard library only.

## `build_dra.py`: the Douay-Rheims (DRA)

Rebuilds `translations.DRA` in every `data/<book>.json` so it uses the same English (KJV-style)
verse numbering as KJV/ASV/WEB/YLT. Nothing else in the book files is touched.

```bash
python3 pipeline/build_dra.py --dry-run   # fetch, remap, validate, print the report; write nothing
python3 pipeline/build_dra.py             # same, then write data/ (refuses if validation fails)
```

Downloads are cached in `pipeline/.cache/` (gitignored); delete it to re-fetch.

**Sources**
- Text: Douay-Rheims 1899 American Edition, <https://ebible.org/Scriptures/engDRA_vpl.zip>
  (public domain), in Vulgate order. (open-bibles' `eng-dra.zefania.xml` isn't usable: it isn't in
  Vulgate order and contains "dummy verses" placeholders and lost verses.)
- Versification: Copenhagen Alliance standard mappings `vul.json` and `eng.json`,
  <https://github.com/Copenhagen-Alliance/versification-specification> (data licensed CC BY-SA 4.0).
  Both map onto the original-language baseline ("org"), so Vulgate → English is `vul` composed
  with the inverse of `eng` (`versification.py`).

**Rules** (`versification.remap_vulgate_to_english`)
- Merges (several Vulgate verses → one English verse): texts concatenated in order.
- Splits (one Vulgate verse → several English verses): the whole text goes on the first; the rest
  stay empty and are logged.
- Verse 0 (psalm titles): prefixed onto English verse 1.
- An org verse with no English number (e.g. org 1 Sam 20:42 + 21:1 = English 20:42, two-part
  psalm titles): merged into the next org verse's English verse ("fallback").
- The additions the DRA carries inside Daniel/Esther go to the deuterocanonical books (`DRA_DEUTEROCANONICAL_FROM`):
  Dan 3:24-90 → Prayer of Azariah, Dan 13 → Susanna, Dan 13:65 + 14 → Bel, Esther 10:4-16:24 →
  Additions to Esther. Wisdom, Baruch (ch. 6 = Letter of Jeremiah) and 1-2 Maccabees go through the
  mapping (`DRA_DEUTEROCANONICAL_MAPPED`). Tobit, Judith and Sirach get no DRA: the Vulgate is a different
  recension there, and its verses don't correspond to the KJV/WEB. 1-2 Esdras and the Prayer of
  Manasseh aren't in this DRA. The index's per-book `translations` list gains "DRA" where it's written.

**Overrides** (`build_dra.py`): where the 1899 DRA's own division differs from the `vul` scheme,
`SOURCE_OVERRIDES` renumbers source verses first and `TARGET_OVERRIDES` pins a source verse to an
English verse. Each entry was checked against the KJV text and carries a comment.

**Report**: `split`, `fallback`, `override`, `gap` (KJV verses with no DRA text, normally the second
verse of a merge), `unmapped`/`other-book`/`dropped`, and validation failures: chapter sets
differing from the KJV, runs of 3+ verses matching the KJV better one verse over, and placeholder
text. Known gaps after the current build: the second verse of each merge (21, e.g. Ps 20:9 is inside
20:8), plus text the Vulgate lacks or condenses: Gen 49:32, Exod 39:19-20, 40:15, Neh 12:33,
Song 1:1 and Isa 46:12.

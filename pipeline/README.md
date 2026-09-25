# pipeline/

Offline data tooling. Nothing here is served or needed by the app. Python 3.11+, standard library only.

**`python3 pipeline/build.py` rebuilds everything from `raw/`.** Two runs are byte-identical. The
design and the phase-by-phase results are in `docs/v2-plan.md`; adding a translation is in `AGENTS.md`.

```
raw/  --import_sources.py-->  sources/  --compile.py-->  dist/
(upstream files,              (each source in its         (what the app reads:
 gitignored, pinned in         own numbering; manifests    shared verse IDs,
 sources.lock.json)            hold the corrections)       validation.json)
```

| File | Does |
|---|---|
| `build.py` | runs `import_sources.py`, then `compile.py` |
| `fetch.py` | fills `raw/` from `sources/sources.lock.json`: files from pinned URLs, repos from the GitHub tarball of the locked commit; refuses anything whose sha256 differs |
| `lock.py` | lock-file hashing and checking (`lock.update()` re-hashes after a deliberate upstream change) |
| `import_sources.py` | runs each manifest's importer (`importers/`): osis (KJV), zefania (ASV, YLT), usfx (WEB), vpl (eBible DRA), tagnt (Greek), morphhb (Hebrew), lexicons, fathers |
| `sources.py` | readers for `sources/` (and the Greek/Hebrew word selection the app shows) |
| `tvtms.py` | the versification engine: STEPBible TVTMS (Expanded section) + manifest `[[override]]`/`[[map]]`, onto the pivot (TVTMS Standard = KJV numbering, psalm titles = verse 0) |
| `compile.py` | `sources/` → `dist/`, `dist/validation.json`, `dist/versification.txt`; fails on any error |
| `books.py` | the permanent book table: codes, ordinals (vid = ord·2²⁰ + ch·2¹⁰ + v), per-source book names |

## Manifest corrections

In `sources/**/manifest.toml`, each with a `reason`:

```toml
[[override]]            # force a TVTMS tradition for native verses, or keep their numbers
ref = "PHP 1:16-17"     # a range, a cross-chapter span "DAN 13:1-14:42", or a whole book "SIR"
use = "identity"        # or a SourceType token: "Latin", "Greek2", "Eng-KJV", ...

[[map]]                 # explicit native -> pivot; equal lengths pair 1:1, a single verse merges/splits
from = "1TH 4:12-17"
to   = "1TH 4:13-18"    # "drop" removes it (fathers); a fathers `from` can also be an exact cited ref

recension = ["TOB"]     # books whose text isn't linked to the others (Compare says so)
exclude = ["PS2"]       # books not imported
```

Word-count tests in TVTMS are unreliable in English, so every decision that depended on one is listed
in `dist/validation.json` for review.

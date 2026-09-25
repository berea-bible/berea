# Berea v2 data architecture: plan

Status: **all six phases done** (phase 6 cleanup and the done-when check in §14); phase 5 (app switch-over) in §13; phase 4 (runtime module + tests) in §12; phase 3 (engine, compiler, dist/, compat) in §11; phase 2 (sources) in §10. Phase 1 (plan) approved with the §9 recommendations. The decisions in the step-2 brief are fixed: TVTMS Expanded
for every source, separate deuterocanonical books, one pipeline (raw/ → sources/ → dist/), static site,
Python stdlib, and the app working throughout via a compatibility data/. This document maps how the
current code becomes v2, file by file. Open questions are in §9.

## 1. Why

Today every source is re-keyed to KJV numbering at build time, so each source loses its own verse
numbers:

- the WEB's Rom 14:24–26 doxology is moved to 16:25–27
- the Greek's 3 John 1:15 is folded into 1:14
- DRA readers see KJV numbers (Ps 23, not the Douay's Ps 22)

v2 keeps each source in its own numbering. Everything links through one pivot verse ID (vid), so adding a
translation means adding one folder under `sources/translations/`.

## 2. Today: how data is built and read

### 2.1 Build (`python3 pipeline/build.py`)

| Step | Script | What it does |
|---|---|---|
| 1 | `../pipeline/build_data.py` | 66 books from `../pipeline/build/raw/`. Text parsers are in `parse_translations.py`: KJV OSIS (`parse_osis_kjv`), ASV/YLT Zefania (`parse_zefania`), WEB USFX (`parse_usfx`). `parse_greek.py` reads TAGNT (NA words, TR fallback) **keyed by the `[KJV]` bracket ref**, plus the TBESG lexicon. `parse_hebrew.py` reads morphhb WLC (Hebrew numbering) and HebrewStrong. `parse_fathers.py`: eligibility filter (category, `condemned_by_council`, year ≤ 800), 900-char truncation, filename refs `Book ch_v1-v2.toml`. |
| 2 | `build.py` | copies that output to `pipeline/.stage/data` |
| 3 | `pipeline/remap_hebrew.py` | Hebrew words → KJV numbering using TVTMS's *Condensed* English↔Hebrew list, plus two fixes: Neh 7:68–69, and `SPLIT_BEFORE` for Ps 13:6. Half-verses are split at the atnach. |
| 4 | `../pipeline/build_deuterocanonical.py` | The 14 books from KJV + WEB. Fixes: `renumber_2esd_7`, `renumber_web_prman`, `strip_plural_marker`, `WEB_SKIP={addesth}`. Fathers `reroute()`: Dan 13 → Sus, Dan 14 → Bel, Esth 10:4–16:24 → addesth. |
| 5 | `pipeline/build_dra.py` + `versification.py` | eBible DRA (Vulgate order) → English via Copenhagen `vul` ∘ `eng⁻¹`. Hand tables: `SOURCE_OVERRIDES` (7 books), `TARGET_OVERRIDES` (22 books), `DRA_DEUTEROCANONICAL_MAPPED` and `DRA_DEUTEROCANONICAL_FROM` (Dan 3/13/14 and Esth 10–16 offsets). |
| 6 | `pipeline/finalize.py` | `fix_web_doxology`, 24 `FATHERS_REF_FIXES`, a check that every fathers ref is a KJV verse, global quote dedupe into `fathers/<book>/<ch>.json`, lexicon index + 500-number buckets, words into `original/<book>.json` |
| 7 | `build.py` | swaps the staged result into `data/` |

Caches: `pipeline/.cache/` holds `engDRA_vpl.zip`, `tvtms.txt`, `vul.json` and `eng.json`.

### 2.2 App code that reads data/ (the switch-over map)

| Module / function | Reads | Replaced in phase 5 by |
|---|---|---|
| `data.js` `loadIndex` → `INDEX` | `books-index.json`: `translations`, `ntOnlyTranslations`, `otBookIds`, `deuterocanonicalBookIds`, per-book `chapters`/`verseCounts`/`fatherVerseCount`/`translations`, father totals, `lexiconBucketSize` | `catalog.json` |
| `data.js` `loadBook`, `bookCache` | `<book>.json`: `translations.{KJV,ASV,WEB,YLT,DRA}[ch][v]`, `fathers[ch][v]` | `chapter()`, `compare()` |
| `data.js` `loadOriginal` | `original/<book>.json` | `originalForPivots()` |
| `data.js` `loadQuotes` | `fathers/<book>/<ch>.json` | `commentary()` |
| `data.js` `lookupLexicon`, `lexiconKey` | `lexicon/index-{G,H}.json`, `lexicon/{G,H}/<n>.json` | `lexicon()` (same format) |
| `data.js` `bookMeta`, `isOT`, `isDeuterocanonical`, `chapterNumbers`, `translationAvailable`, `translationCodes`, `effectiveTranslation` | `INDEX` | `navBooks()` and catalog lookups |
| `data.js` NASB/ESV (`rememberNasb`, `rememberEsv`, `getCached*`) | write into `bookCache[id].translations.NASB/ESV` | keep their own cache; move to `js/live.js` |
| `reader.js` `renderNav` | `INDEX.books`, `isOT`/`isDeuterocanonical` sections, `fatherVerseCount` | `navBooks(tr, profile)` |
| `reader.js` `populateChapterPicker`, `stepChapter` | `chapterNumbers` | catalog chapter lists per native book |
| `reader.js` `renderChapter` | `book.translations[tr][ch]`, `book.greek[ch]`, `book.fathers[ch]` (fathers mark) | `chapter()`, `originalForPivots()`, the commentary index |
| `reader.js` `ensureOriginal`, `setLanguageLabels` | `loadOriginal`, `isOT` | a language per pivot book |
| `panel.js` `openVerse` (Compare) | the same `ch:v` in every translation: **the core change** | `compare()` |
| `panel.js` `renderGreekTab` | `book.greek[ch][v]` | `originalForPivots(lang, vids)` |
| `panel.js` `renderFathers`, badge | `book.fathers[ch][v]`, `loadQuotes` | `commentary('fathers', vids)` |
| `greek.js` `showLexicon`, `displayWord` | `lookupLexicon`; word fields `g/s/m/gl/t` | the same fields, from the columnar tokens |
| `app.js` prefs (`verbum-prefs`) | `{bookId, chapter, translation, showGreek, theme}` | adds `canon`; `bookId` becomes a native book code (migrated from the old ids) |

## 3. File-by-file

### 3.1 Moves

- `../pipeline/build/raw/*` → `raw/`: translations, greek, morphhb, HebrewLexicon, fathers. That is about
  590 MB (fathers 392 MB, morphhb 113 MB).
- `pipeline/.cache/engDRA_vpl.zip` and `tvtms.txt` → `raw/`.
- `raw/` is gitignored. `pipeline/fetch.py` downloads it and checks it against `sources.lock.json`.
- The parsing logic moves into the importers:
  - from `parse_translations.py`, `parse_greek.py`, `parse_hebrew.py` and `parse_fathers.py` (`eligible_authors`,
    `truncate`, `VERSE_FILE_RE`)
  - from `build_dra.py` (`load_ebible`, `clean`, `HEADING`, `EBIBLE_TO_USFM`)
  - from `build_deuterocanonical.py` (`strip_plural_marker`, and the multi-id books such as Baruch + LJE).

### 3.2 New

```
raw/                         gitignored: upstream files, byte-for-byte
sources/                     committed, human-editable, native numbering
  sources.lock.json          per raw input: upstream URL, commit or sha256
  translations/<id>/manifest.toml, <BOOK>.tsv    kjv asv web ylt dra; nasb esv (manifest only, live)
  original/grc/manifest.toml, <BOOK>.tsv         TAGNT, NA numbering
  original/hbo/manifest.toml, <BOOK>.tsv         morphhb WLC, Hebrew numbering (titles = verse 1)
  lexicon/grc.jsonl, hbo.jsonl                   TBESG, HebrewStrong
  commentary/fathers/manifest.toml, authors.tsv, quotes/<BOOK>.jsonl   (per cited book: one file would be ~90 MB)
dist/                        committed (served by GitHub Pages), generated, never hand-edited
data/                        compatibility output until phase 6
pipeline/
  build.py                   one command: fetch check → import → compile → compat
  fetch.py                   fills raw/ from sources.lock.json
  lock.py                    lock-file hashing/verification
  import_sources.py          raw/ → sources/ (phase 2)
  books.py                   ordinal table + per-source book-name maps (§4)
  importers/{osis,zefania,usfx,vpl,tagnt,morphhb,lexicons,fathers}.py
  tvtms.py                   versification engine (§5)
  compile.py                 sources/ → dist/ + dist/validation.json
  compat.py                  dist/ → data/ in today's format
js/berea-data.js             runtime module (§7)
js/live.js                   NASB/ESV/FUMS code moved out of data.js, otherwise unchanged
tests/*.test.mjs             Node tests (`node --test tests/*.test.mjs`)
docs/v2-plan.md              this file
```

The lexicon and word files are also committed as `sources/`. Measured in phase 2, sources/ is 142 MB:

| Part | Size |
|---|---|
| translation TSV | 21 MB |
| word TSV (grc 15 MB, hbo 14 MB) | 29 MB |
| lexicons | 5.3 MB |
| fathers | 87 MB (largest file 9.7 MB, JHN) |

### 3.3 Deleted (phase 6)

- `../pipeline/` scripts: `build_data.py`, `build_deuterocanonical.py`, `parse_*.py`, `books.py`,
  `paths.py`. That repo is archived; nothing more is added there.
- `pipeline/remap_hebrew.py`, `build_dra.py`, `versification.py` and `finalize.py`.
- `pipeline/compat.py` and `data/`.
- `js/data.js`: the index/book/original/quotes/lexicon loaders. What's left moves to `js/live.js`.
- `vul.json` and `eng.json` (Copenhagen) and `raw/translations/eng-dra.zefania.xml` (unused since the eBible
  DRA).

### 3.4 Code that becomes manifest data

| Today | v2 |
|---|---|
| `FATHERS_REF_FIXES` (24: 19 moves, 5 drops) | `[[map]]` in `commentary/fathers/manifest.toml`; drops use `to = "drop"` |
| `reroute()` Dan 13/14 | fathers `[[override]] ref="DAN 13:1-14:42" use="Latin"`: TVTMS's Latin rows send them to SUS/BEL |
| `reroute()` Esther 10:4–16:24 | nothing: identity lands on pivot EST 10:4–16:24, which the ADE re-map (§4) moves |
| `fix_web_doxology` | nothing: the TVTMS `Greek2` row `Rom.14:24 → Rom.16:25` (test `Rom.16:24=Last`) |
| `renumber_2esd_7`, `renumber_web_prman` | nothing if TVTMS's 2Es/Man rows cover them; otherwise a `[[map]]` (checked in phase 3) |
| `remap_hebrew` Neh 7:68 fix, `SPLIT_BEFORE` | nothing: the Expanded section's rows reproduce both (phase 3 found the Hebrew identical to today) |
| DRA `SOURCE_OVERRIDES` / `TARGET_OVERRIDES` / `DRA_DEUTEROCANONICAL_FROM` | re-derived in phase 3 (§8): each old placement is a hand-checked reference; TVTMS decides first, and a disagreement becomes an `[[override]]`/`[[map]]` whose `reason` carries the old comment |
| `WEB_SKIP={addesth}` | WEB's `ESG` is imported as its own native book (see §9 Q2) |
| `NT_ONLY_TRANSLATIONS`, per-book `translations` lists | derived: a translation covers exactly the native books in its sources folder |

## 4. Shared verse ID

`vid = ord × 2^20 + ch × 2^10 + v`. The largest value is about 83 × 2^20, well under 2^31. A chapter is at
most 150 (< 1024) and a verse at most 176. Verse 0 holds a psalm superscription.

Ordinals are fixed forever. New books are appended and never renumbered:

| Ord | Codes |
|---|---|
| 1–39 | GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL |
| 40–66 | MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV |
| 67–82 | TOB JDT ADE WIS SIR BAR LJE S3Y SUS BEL 1MA 2MA 1ES 2ES MAN ESG |
| 83+ | reserved for later: PS2 3MA 4MA ODA 4ES … |

- ADE (Additions to Esther, KJV style) is a pivot-only code, since USFM has only ESG (Greek Esther).
- After the TVTMS step, pivot EST 10:4–16:24 → ADE (same ch:v) and pivot BAR 6:v → LJE 6:v (keeping chapter 6, the KJV's own numbering). As a result
  every deuterocanonical text is its own pivot book, and canon filtering works at book level.
- The display order comes from the canon profiles in `catalog.json`, not from ordinals:
  - protestant: the 66 books
  - catholic: the 66 plus TOB JDT WIS SIR BAR LJE 1MA 2MA ADE S3Y SUS BEL
  - orthodox: catholic plus 1ES MAN ESG, later PS2 3MA
- Today's app ids (`gen`, `1cor`, `addesth`, …) map 1:1 onto codes in `books.py`, for the prefs migration
  and `compat.py`.
- The native book codes of each source are mapped in `books.py`:
  - KJV OSIS `EpJer` is native LJE, and `EsthGr` is native ADE, in the KJV's own numbering 10:4–16:24.
  - The DRA's DAN (with ch. 13–14 and 3:24–90) and EST (with 10:4–16:24) stay native DAN/EST.

## 5. Versification engine (`pipeline/tvtms.py`)

### 5.1 Input

The input is the rows between `#DataStart(Expanded)` (line 4181) and `#DataEnd(Expanded)` (line 27570):
22,874 data rows. Columns: SourceType, SourceRef, StandardRef, Action, NoteMarker, three notes, Tests.

Observed in the data, which the parser must handle:

- **SourceType** is a `+`-joined label (`Eng-KJV+Hebrew+Latin`, `Latin2-DRA`, `English2+Latin+Greek`,
  `GrkTitleSeparate`, `AllBibles`, …). Stray whitespace and `=` are trimmed (`"Bulgarian "`, `"Latin="`).
  - The tests decide whether a row applies; the label only groups alternatives.
  - An `[[override]] use = "Latin"` selects the rows whose label contains the token `Latin`.
- **Action** (with an optional `*`): `Keep verse`, `Renumber verse`, `Renumber title`, `Psalm title`,
  `Concatenation`, `MergedPrev`/`MergedNext verse`, `DividedPrev`/`DividedNext verse`, `CopiedFrom verse`,
  `MovedFrom verse`, `IfEmpty verse`.
- **Refs**: `Book.ch:v`, with the book code in mixed case and inconsistent (`Lje`/`LJe`). Codes are
  upper-cased onto the ordinal table (`Ezk`→EZK, `Sng`→SNG, `Man`→MAN, `1Es`→1ES, `Psa`→PSA).
  - Parts are `!a`, `!b`, … and `!0`.
  - A ref may be a list or cross-chapter (`Rev.12:18; 13:1`, `Est.10:4-13; 11:1`), inheriting book and
    chapter; standard chapter lengths come from the Standard side of the table itself.
  - Lettered chapters (`Est.A:17`) and subverses (`X.n`, n ≥ 1) never exist in our sources.
- **Tests**: `&`-joined atoms:
  - `Ref=Exist`, `Ref=NotExist`, `Ref=Last`
  - `A<B` and `A>B` on word counts, with `*n` multipliers and `+` sums
  - `Ref:TextBeforeV1=Exist|NotExist`

### 5.2 Model and algorithm

1. Model each source as `{(book, ch, v): word_count}` from `sources/`. Verse 0 exists when there's a
   superscription.
2. Group the rows by (native verse, SourceType). Rows with the same SourceRef are alternatives, and at least
   one must pass. Every part of the verse (whole, `!a`, `!b`, …) needs a passing row for that tradition to
   apply to that verse.
3. Resolution order per native verse:
   1. an explicit `[[map]]`
   2. `[[override]]` (a forced tradition or identity)
   3. the traditions whose tests pass
   4. identity, when the verse appears in no row and its number is a Standard verse.

   If several traditions pass with different results, that's an error unless an override pins it.
4. `IfEmpty verse` rows don't map anything. They are collected as the pivot verses a source may lack
   (reason `variant`).
5. Post-TVTMS book re-map: EST 10:4–16:24 → ADE, BAR 6 → LJE (§4).
6. The decision report lists every applied row, grouped by book and chapter and marked `structural` or
   `word-count`. Word-count tests are unreliable in English. Known case, Phil 1:16–17 (test
   `Php.1:16>Php.1:17` / `<`):
   - KJV, WEB and YLT keep their numbers.
   - ASV, DRA and the Greek are swapped relative to KJV.
   - All of these get `[[override]]` pins.
7. Cross-check: the hbo mapping vs. morphhb `raw/morphhb/wlc/VerseMap.xml`. The only expected differences are
   the two-verse psalm titles (Ps 51, 52, 54, 60).

### 5.3 Manifest format

```toml
name = "Douay-Rheims (1899 American Edition)"
abbrev = "DRA"
language = "en"
license = "Public domain"
raw = "raw/translations/engDRA_vpl.zip"
upstream = "https://ebible.org/Scriptures/engDRA_vpl.zip"
importer = "vpl"
versification = "auto"          # or "identity"

[[override]]                     # force a TVTMS tradition (a SourceType token) or no remap
ref = "PHP 1:16-17"
use = "identity"
reason = "..."

[[map]]                          # explicit native → pivot mapping TVTMS doesn't describe
from = "1TH 4:12-17"
to   = "1TH 4:13-18"             # equal lengths pair 1:1; a single verse on one side = merge/split
reason = "..."                   # to = "drop" removes the citation/verse (fathers only)
```

`to = "drop"` is the one addition to the brief's format, needed for the 5 dropped fathers refs. Also
supported: `recension = ["TOB", ...]` (books whose text isn't linked; absent reason "recension"), and a
fathers `[[map]]` whose `from` is exactly a cited ref string, which catches refs that aren't valid ranges.
The `[[split]]` list planned here turned out not to be needed: the atnach split reproduces today's
Hebrew exactly, including Ps 13:6.

## 6. dist/ (runtime layer)

Written as in the brief:

- **`catalog.json`**
  - `books`: `[{code, ord, group, name}]`
  - `profiles`: `{protestant, catholic, orthodox: [codes]}`
  - `translations`: `{id: {name, abbrev, license, live?, files: {nativeBook: [pivotBooks]}, nav: {nativeBook: [profiles]}, chapters: {nativeBook: [ch…]}}}`
  - lexicon bucket size, father totals and per-pivot-book father counts (for the nav badge)
- **`text/<tr>/<NATIVE_BOOK>.json`**: `{book, ref: [ch*1000+v], text: […], pivot: {row: [vids]}}`. `pivot` is
  sparse, holding only the rows whose pivot differs from `book:ch:v`.
- **`text/<tr>/absent.json`**: `{vid: "variant" | "empty" | "recension" | "missing"}`
- **`orig/{grc,hbo}/<BOOK>.json`**: columnar tokens
  - common columns: `ref`, `start`, `pivot`, `surface`, `strong`, `morph` (an index into `orig/tables.json`)
  - Greek adds `gloss`, `translit`, `editions`; Hebrew adds `lemma`
- **`lex/{grc,hbo}/index.json`, `lex/<lang>/def/<n>.json`**: the step-1 format, unchanged.
- **`comm/fathers/idx/<PIVOT_BOOK>.json`**: `{vid: [quoteId…]}` plus each quote's body chunk. Bodies stay
  per chapter as `comm/fathers/body/<PIVOT_BOOK>/<ch>.json`, each distinct quote stored once, as in step 1.
- **`validation.json`**: `{source: {errors: […], warnings: […]}}`.
  - Errors fail the build: an unmapped native verse, a pivot outside the Standard, a fathers ref to a verse
    that doesn't exist, or an empty mapping.
  - Warnings include `missing` absences and every word-count decision.

## 7. Runtime (`js/berea-data.js`, one plain ES module)

`compare`, `chapter`, `navBooks`, `originalForPivots`, `lexicon` and `commentary` follow the brief's
signatures. It keeps step 1's `loadOnce` caching: each file is fetched once per session, and failures
aren't cached.

Load budget: opening John loads `catalog.json` + `text/kjv/JHN.json` + `comm/fathers/idx/JHN.json`. That
has to stay under step 1's 0.677 MB (today's book file carries all five translations).

- Compare loads the other translations' `JHN.json` on first panel open.
- `absent.json` is loaded with the translation.
- Nothing else loads until it's used.

Pivot IDs are internal and never displayed: the reader always shows the chosen translation's own books and
numbers.

## 8. Phases and how each is checked

1. **Plan**: this document. Stop and report.
2. **Sources**: importers and `sources.lock.json`.
   - Report per source: books, verses (incl. empty and verse-0), words and quotes, against today's data.
   - Every difference is explained: native vs. KJV numbering, kept empty verses, psalm titles. KJV OSIS has
     138 `type="psalm"` titles and WEB USFX has 139 `<d>`; today both are dropped.
3. **Engine + compiler + compat**: `dist/`, `validation.json` and `data/` from `compat.py`.
   - Byte-compare with today's `data/`. Expected identical: KJV/ASV/WEB/YLT text, Greek, Hebrew (the Expanded
     rows should reproduce the Condensed result plus the 2 fixes), lexicon and fathers.
   - Expected to differ: the DRA. Every changed KJV placement is listed and resolved one at a time, with the
     old hand-checked placement as the reference.
   - Report all warnings and word-count decisions.
4. **Runtime + Node tests** (`node --test`). Everything in the brief's test list:

   | Area | Cases |
   |---|---|
   | DRA renumbering | KJV Mark 9:1 ↔ DRA 8:39 · KJV Rev 13:1 ↔ DRA 12:18+13:1 · KJV Ps 23:1 ↔ DRA Ps 22:1 · KJV 1 Thess 4:18 ↔ DRA 4:17 |
   | Hebrew psalm titles | KJV Ps 3 title ↔ Hebrew 3:1 · KJV Ps 51:1 ↔ Hebrew 51:3 |
   | Other renumbering | WEB Rom 14:24 ↔ KJV Rom 16:25 · Phil 1:16–17 per translation |
   | Deuterocanonical books | DRA Dan 13:1 ↔ KJV Sus 1:1 · DRA Esth 11:2 ↔ KJV ADE · DRA Bar 6:1 ↔ KJV LJE |
   | Absences | ASV on Susanna → not-in-translation · WEB Acts 8:37 → empty · YLT on Genesis → not-in-translation |
   | Canon profiles | the protestant profile hides TOB, DRA Dan 13 and Dan 3:24–90 |
   | Lexicon and fathers | lexicon lookups in G and H · fathers on John 1:1 · "Daniel 13" citations on Susanna |

5. **App switch-over**, one feature at a time, in this order: reader → Compare → original language → lexicon →
   Fathers → canon toggle + nav.
   - After each: Playwright on desktop and iPhone emulation, no console errors, and the step-1 checks.
     Those are John 1:1 (Greek line, lexicon, Compare, Greek tab, 106 citations), Psalm 23, Wisdom 1 and the
     Romans doxology, plus the load-budget check (§7).
6. **Cleanup**: delete per §3.3. Update README/AGENTS.md with "adding a translation":
   1. Add `sources/translations/<id>/` with a manifest.
   2. Run `python3 pipeline/build.py`.
   3. Read `dist/validation.json`.
   4. Add overrides only where it shows problems.

**Done when:**

- One command rebuilds everything from `raw/`, and two runs are byte-identical.
- There are no validation errors, and every warning is explained.
- All tests pass and every feature works as before.
- Opening a chapter loads no more than after step 1.

## 9. Open questions (each with a recommendation)

1. **NASB/ESV numbering.** Both are live, so there's no text at build time and word-count tests can't run.
   *Recommendation:* a manifest with `versification = "identity"`, since the Standard is essentially modern
   English numbering, plus hand-checked `[[map]]`s for the known differences (e.g. 3 John 1:15 → pivot 1:14,
   Rev 12:18). A fetched verse with no known pivot still shows under its own number in the reader.
2. **WEB Greek Esther (`ESG`).** TVTMS maps it to a separate Standard book, `Esg`, and today it's skipped.
   *Recommendation:* import it as pivot book ESG, shown only in the orthodox profile, so nothing visible
   changes. Compare on KJV ADE keeps saying "Not in WEB".
3. **WEB's other books** (PS2, 3MA, 4MA) and TVTMS books with no source (ODA, 4ES). *Recommendation:* don't
   import them now. Their ordinals are reserved, so adding one later is a one-folder change.
4. **raw/ provenance.** raw/ isn't committed (590 MB); `fetch.py` restores it from `sources.lock.json`.
   - Git checkouts, locked by commit:
     - the fathers corpus: HistoricalChristianFaith/Commentaries-Database @ `8e8082b`
     - openscriptures/morphhb
     - openscriptures/HebrewLexicon
   - Locked by sha256, with a URL: eBible `engDRA_vpl.zip` and TVTMS.
   - `raw/translations/` (open-bibles files) and `raw/greek/` (STEPBible TAGNT/TBESG) are currently committed
     inside berea-bible/pipeline rather than fetched upstream.

   *Recommendation:* point those two at their upstreams (seven1m/open-bibles, STEPBible/STEPBible-Data),
   pinned by commit and sha256.
5. **Psalm titles in the reader.** KJV/WEB titles become verse 0 and are displayed as an unnumbered
   superscription above verse 1. *Recommendation:* show them (the Hebrew↔KJV title test needs them to exist).
   `compat.py` drops them, so data/ stays byte-compatible.

## 10. Phase 2 result: sources/

`python3 pipeline/fetch.py` fills `raw/` from `sources/sources.lock.json`. It was tested from empty: all 13
inputs download from their pinned upstreams in about 30 s and match their hashes.

`python3 pipeline/import_sources.py` runs raw/ → sources/ in about 9 s. A second run writes 0 files.

| Source | sources/ | vs. today's data/ |
|---|---|---|
| KJV | 81 books, 36,936 verses | 36,785 identical at the same ref. New: 116 psalm titles as verse 0. Renumbered today: 2 Esdras 7:36–70 (35 verses; today +70) |
| ASV | 66 books, 31,102 verses | all identical |
| YLT | 27 books, 7,957 verses | all identical |
| WEB | 81 books, 37,047 verses | 36,725 identical. New: 116 titles, 25 empty verses (Acts 8:37, 15:34, 24:7, Luke 17:36, Rom 16:25, 20 in Sirach), ESG (164 verses). Renumbered today: Prayer of Manasseh 1:5–15, Rom 14:24–26. Fixed: S3Y 1:55–56 no longer start with the printed numbers "56"/"55" |
| DRA | 73 books, 35,811 verses, Vulgate numbering | 29,990 identical at the same ref. 3,374 renumbered today, 208 merged into another verse today. 2,239 not in today's data: Tobit, Judith and Sirach (excluded by design), plus Bar 3:38, Esth 15:17–19 and Rev 12:18, which today's remap dropped |
| grc (TAGNT) | 27 books, 142,096 word rows (every edition), NA numbering | Today's selection rebuilt from sources: all 7,957 verses identical |
| hbo (morphhb) | 39 books, 306,785 words, Hebrew numbering | Today's filter gives today's 299,540 words plus 11 that today silently lost (words containing a large/small-letter `<seg>`). Not used today and kept for the compiler: 1,268 ketiv forms and 5,966 words with no Strong's number |
| lexicon grc / hbo | 10,847 / 8,674 entries | all identical |
| fathers | 251 of 336 authors eligible, 67,110 citations, 64,694 distinct quotes | Today has 64,690, all included. Extra: Tertullian "Matt 6:38" (dropped today by a fix) and 3 Jerome refs with backwards ranges (`GEN 19:36-11`, `GEN 41:50-10`, `ISA 13:18-4`, meaning "and following"), which today silently indexes nowhere |

Refs the phase-3 fathers manifest must route: Daniel 13 (72 citations), Daniel 14 (7), and Daniel 3:24+ (27;
today these sit on the Hebrew-text Dan 3:24–30). No citations are filed under Esther 10:4–16:24.

Source-format notes found in phase 2:

- The KJV files the Letter of Jeremiah as its own book (`EpJer`) with chapter 6, so it is native LJE 6. The
  WEB's LJE is chapter 6 too. (An earlier version of this note said chapter 1; phase 4's tests caught it.)
- TAGNT numbers words within the NRSV verse, so under NA numbering (Mark 12:14–15) word numbers repeat.
  Each word row keeps the raw ref in `alt` (e.g. `12.15(12.14)`), which is what rebuilt today's KJV keying
  exactly.

## 11. Phase 3 result: engine, compiler, dist/, compat

`python3 pipeline/build.py` = `import_sources.py` → `compile.py` → `compat.py`. It takes about 18 s, and
two runs give byte-identical `sources/`, `dist/` and `data/`. `dist/` has 1,750 files (102.5 MB):
text 21 MB, orig 23 MB, lex 4.4 MB, comm 54 MB. `dist/validation.json` has **0 errors**.

### Engine semantics settled against the data (`pipeline/tvtms.py`)

- **`NotExist` = "no text".** The TVTMS header also asks for text in the previous verse, but the tests
  don't use it that way: `Psa.9:30=NotExist` must be true for Hebrew Psalm 9, which ends at 21.
- **`Exist` and `Last` count only verses with text.** WEB's blank placeholders (Rom 16:25, Sirach 20:32)
  therefore don't count. That is right for Romans (WEB's doxology is detected) and wrong for Sirach,
  which has an override.
- **Untested rows (`AllBibles`) are defaults**, used only when no tested tradition passes.
- **Range SourceRefs are summaries of the per-verse rows**, so they are skipped. Per-part rows (`!a`,
  `!b`) are kept, and the Hebrew half-verses split at the atnach.
- **A verse counts as a word-count decision only when a word-count test could change its outcome.**
- **The Greek maps per word.** Each word's pivot is TAGNT's own KJV reference, which is finer than a
  verse-level mapping (e.g. NA 1 John 2:14's first clause is KJV 2:13). Every word was checked against
  the TVTMS verse mapping: 170 words sit on the neighbouring verse, and none further away.

### Corrections (all in manifests, each with a reason)

Every one was decided by comparing with today's hand-verified data and scoring word overlap with the
KJV text.

| Source | Entries |
|---|---|
| KJV | Phil 1:16–17 identity (word-count misfire); Additions to Esther 15 identity (Latin2 tests don't exclude the KJV); Tobit 7 identity (TVTMS's Standard Tobit 7 has 16 verses, this edition 18) |
| WEB | Phil 1:16–17 identity; Sirach forced to `Eng-KJV` (blank placeholder verses defeat `=Last`); ESG identity; Prayer of Manasseh 1:4–15 maps (WEB splits KJV 1:4; TVTMS has no row); Tobit 7 identity |
| ASV, DRA, Greek, NASB, ESV | Phil 1:16–17 swapped (Greek order); YLT pinned to identity |
| NASB, ESV | also 3 John 1:15 → pivot 1:14 |
| DRA | 30 maps where this 1899 edition divides verses differently from the Vulgate TVTMS models: 1–2 Thess (no TVTMS rows), 1 Macc 1, 2 Macc 15:36–40, the Letter of Jeremiah, Matt 5:4–5, Num 27, Isa 46:11–12, Prayer of Azariah 1:55–56. `recension = TOB, JDT, SIR`. |
| fathers | Daniel 13 → Susanna and Daniel 14 → Bel with the same verse numbers (checked by content: TVTMS's Latin rows would put Bel one verse later, wrongly for this corpus); the 3 Jerome "and following" ranges; the 19 moves and 5 drops from `FATHERS_REF_FIXES`. Daniel 3:24–30 stays identity (checked: those citations are Hebrew/KJV numbering). |

### Compatibility output vs. today's data/

- 994 of 1,432 files are byte-identical.
- Of the rest, 361 are fathers body files, which differ only in the order quotes are stored. Compared
  as sets per verse, citations are identical except for 3 recovered Jerome quotes (Gen 19:36–38,
  41:50–52, Isa 13:18–22).
- 16 `original/` files: the 11 recovered Hebrew words, plus JSON key order (TR-only verses such as
  John 5:4 used to be appended at the end of their chapter).
- The index differs only in those counts and in Sirach 44 (22 verses: WEB 44:23 joins 44:22, as the
  KJV has it).
- Changed translation text, all accepted:

  | Translation | Change | Why |
  |---|---|---|
  | DRA | Additions to Esther 15 (16 verses), Baruch 3:34–37, Prayer of Azariah 1:47–50, Rev 13:1 (now with 12:18), Psalm titles of 10/11/51/52/54/60 | TVTMS places them better than today (by KJV overlap) |
  | DRA | Exod 39:17–18, Judg 21:24, Neh 12:33, Wis 19:12 and 19:20 | the verse covers two KJV verses and now sits on the first |
  | ASV | Phil 1:16–17 | aligned by content |
  | WEB | Prayer of Azariah 1:55–56 | printed numbers no longer in the text |
  | WEB | Sir 44:23 | joins 44:22 |

The app, run on the regenerated data/, passed the step-1 checks on desktop and iPhone (John 1:1, Psalm
23, Wisdom 1:1, the Romans doxology, lazy loading, extended Strong's) with no console errors.

### Word-count decisions

There are 1,017 in all: ASV 181, KJV 196, WEB 184, DRA 238 and Hebrew 218; YLT and the Greek have none.

- All the English ones keep their verse numbers.
- The DRA's and the Hebrew's renumberings all match today's hand-verified placements, except DRA Exod
  39:17–18, where the Vulgate condenses the text and neither placement can be confirmed; TVTMS is kept.
- The full list is in `dist/validation.json`, and every decision in `dist/versification.txt`.

### Remaining warnings (explained)

- **ASV:** no separate psalm titles, so 116 are "missing".
- **DRA: 28 psalm titles "missing".** The Vulgate folds them into verse 1, and TVTMS maps that verse to
  pivot 1 alone.
- **DRA: 5 missing verses.** Letter of Jeremiah 6:1 (the superscription), 6:6 and 6:41, and 1 Macc 1:34
  and 1:49 (condensed).
- **WEB: 8 missing verses** that the source doesn't have (Sirach 11:15–16, 22:10, 26:19; Prayer of
  Azariah 1:19, 1:45–46, 1:49). They are absent today too.
- **fathers:** 5 citation links dropped by maps.

### For phase 5

- **Load budget.** Opening John would load `catalog.json` + `text/KJV/JHN.json` +
  `comm/fathers/idx/JHN.json`: about 203 KB (47 KB gzipped), versus 600 KB (172 KB gzipped) after step 1.
  The Greek token file for John is 184 KB gzipped, versus 159 KB, because of the translit/editions
  columns. It loads only with the Greek line or tab; the columns can be split off if that matters.
- **Canon toggle. Decided:** it replaces the on/off switch with three settings, Protestant, Catholic
  and Orthodox, which are the three `catalog.json` profiles:

  | Setting | Shows |
  |---|---|
  | Protestant | the 66 books |
  | Catholic | adds Tobit, Judith, the Additions to Esther, Wisdom, Sirach, Baruch, the Letter of Jeremiah, the Prayer of Azariah, Susanna, Bel and 1–2 Maccabees |
  | Orthodox | adds 1–2 Esdras, the Prayer of Manasseh and the WEB's Greek Esther |

  1–2 Esdras and the Prayer of Manasseh, shown to everyone today, then appear only under Orthodox.

## 12. Phase 4 result: runtime module and tests

`js/berea-data.js` is one plain ES module with no dependencies. `createData({base, fetchJSON})` returns
`compare`, `chapter`, `chapters`, `navBooks`, `originalForPivots`, `lexicon`, `commentary`,
`commentaryRefs`, `vid` and `ref`. The loader is injectable, so the Node tests read `dist/` from disk
with the code the browser runs; it was also checked in Chromium loading `dist/` over `fetch`. Each file
is fetched once per session, and failures aren't cached.

Behaviour worth knowing for the switch-over:

- **`compare`** returns, per translation, the verses whose pivots overlap the clicked verse's. Each
  carries its own reference and `renumbered`.
  - Empty rows (WEB's placeholders) are left out, and `absent` then says why: `variant`, `empty`,
    `recension`, `missing`, or `not-in-translation` when the translation doesn't cover that pivot book.
  - Live translations (NASB/ESV) return refs only, since their text is fetched through the Worker as
    today. They are identity-numbered except the verses in `text/<TR>/pivots.json`.
- **`chapter(tr, book, ch, profile)`** hides a verse only when all its pivots are outside the profile.
  **`chapters()`** drops chapters with nothing visible. **`navBooks()`** orders a translation's books by
  where their pivot books fall in the profile.
- **`commentaryRefs`** reads only the index (for the badge); **`commentary`** also loads the bodies.
- Opening a chapter reads `catalog.json` and one text file, and a test checks that.

`node --test tests/*.test.mjs` runs 21 tests, all passing in about 0.4 s. They cover every case in the
brief:

- KJV Mark 9:1 ↔ DRA 8:39; Rev 13:1 ↔ DRA 12:18 + 13:1; Ps 23:1 ↔ DRA 22:1
- KJV Ps 3 title ↔ Hebrew 3:1; Ps 51:1 ↔ Hebrew 51:3, with the two-verse title on 51:0
- WEB Rom 14:24 ↔ KJV 16:25; Phil 1:16–17 in all 7 translations and the Greek
- 1 Thess 4:18 ↔ DRA 4:17 (and DRA 4:11 = KJV 4:11–12)
- DRA Dan 13:1 ↔ KJV Susanna 1:1 (and 13:65 ↔ Bel 1:1); DRA Esther 11:2 ↔ KJV Additions; DRA Baruch 6:1
  ↔ KJV Letter of Jeremiah 6:2
- ASV/YLT/NASB on Susanna and YLT on Genesis → `not-in-translation`; WEB Acts 8:37 → `empty`; DRA Tobit
  → `recension`
- The protestant profile hides Tobit, DRA Daniel 13–14 and Dan 3:24–90
- Lexicon lookups in both languages, including extended Strong's
- Fathers: 106 on John 1:1, and a "Daniel 13" citation on Susanna (reachable from the DRA's Daniel 13)
- Also: 3 John 1:15 folds into KJV 1:14, and the chapter-open load budget

The tests caught a wrong phase-2 note: the WEB's Letter of Jeremiah is chapter 6, like the KJV's, not
chapter 1. The note in §10 and the comment in `tvtms.py` are corrected; no data changed.

## 13. Phase 5 result: the app reads dist/

The app switched one feature at a time, in the brief's order. After each step: the step-1 browser
checks, the v2 checks for that step and everything before it, desktop and iPhone emulation, and no
console errors. Features not yet switched read `data/` through a legacy-id bridge, removed at the end.
Nothing in the app reads `data/` any more; a check fails on any request to it.

| Step | What changed |
|---|---|
| Reader | Book list, chapters and verses from `dist/`, in the shown translation's own structure (DRA: Psalm 22, Daniel 13–14; KJV: Susanna, the Letter of Jeremiah as its own book). Psalm titles are verse 0, shown as a superscription. The pick (`state.translation`) and the translation on screen (`state.shown`: the pick, else the KJV) are separate; switching translation keeps the place via `lib.locate()`. Old saved prefs (`john`, KJV-numbered) are migrated: a saved DRA "ps 23" opens DRA Psalm 22. |
| Compare | `lib.compare()`: each translation's own verses, labelled with their reference when numbered differently ("Mark 8:39"). Translations without the passage say why: "Not in ASV", a verse some manuscripts omit, a different recension (DRA Tobit/Judith/Sirach), no corresponding verse, or "No separate title" on psalm titles. NASB/ESV keep the Load button and work from refs (ESV 3 John 1:14–15 for KJV 1:14). |
| Greek/Hebrew | Line and tab from `lib.originalForPivots()`: each verse shows the words on its own pivots (DRA Mark 8:39 shows the Greek of 9:1; KJV psalm titles carry the Hebrew title). Still loaded only when the line or tab is used. |
| Lexicon | `lib.lexicon()`, same popover. |
| Fathers | Marks, badge and tab from `commentaryRefs`/`commentary` (DRA Daniel 13:1 shows the Susanna 1:1 citations). |
| Canon + nav | Protestant / Catholic / Orthodox switch at the top of the book list, saved in prefs, Protestant by default. It applies in the book list, reader, Compare and Fathers. A chapter partly outside the canon shows a note at the gap (DRA Daniel 3:24–90). Switching away from a hidden book or chapter moves to the nearest one shown (DRA Daniel 13 → 12; Tobit → Genesis 1). Old prefs left on a deuterocanonical book get the canon that shows it. |

The NASB/ESV code now takes book codes: NASB requests `/chapters/JHN.3`, and ESV queries use the
catalog's book name. The IndexedDB/localStorage cache keys keep the old ids (`…:john.3`), so text cached
before v2 stays valid. This was checked with a mocked Worker: the reader, a Compare row served from the
cache, a FUMS report per chapter shown, and ESV 3 John.

Data loaded, measured in the browser (John, KJV, Protestant):

| Action | Now | After step 1 |
|---|---|---|
| Open John 1 | 0.213 MB (0.047 MB gzipped): catalog + `text/KJV/JHN` + fathers index | 0.677 MB (0.198 MB gzipped) |
| First verse opened | +0.426 MB (0.132 MB gzipped): the other translations' John, once per book | nothing extra |
| Fathers tab | 1.243 MB (0.355 MB gzipped) | 1.247 MB (0.359 MB gzipped) |
| Greek tab | 0.930 MB (0.187 MB gzipped) | 1.195 MB (0.167 MB gzipped) |
| First word click | 0.863 MB (0.271 MB gzipped) | 0.867 MB (0.273 MB gzipped) |
| Next chapter in the same book | nothing new | nothing new |

Chapter-open plus first verse together (0.639 MB, 0.179 MB gzipped) is still below what step 1 loaded
just to open the chapter.

## 14. Phase 6 result: cleanup, and the done-when check

Removed:
- `data/` and `pipeline/compat.py`; the build is now `import_sources.py` → `compile.py`
- the pre-v2 scripts `pipeline/build_dra.py`, `remap_hebrew.py`, `finalize.py` and `versification.py`
- `pipeline/.cache/`

The sibling `../pipeline` repo is left untouched: it is archived, not edited, as planned in §3.3.
Nothing references it any more.

The NASB/ESV/FUMS code moved from `js/data.js` to `js/live.js`, unchanged apart from the book-code
arguments. `data.js` (catalog helpers) no longer imports it, so it stays at the bottom of the module
graph.

`AGENTS.md` describes the v2 layout, the build and **adding a translation** (a
`sources/translations/<id>/` folder with a manifest; build; read `validation.json`; correct only
where it shows problems; test). `pipeline/README.md` is the pipeline reference, and the README
links the guide.

**Done when:**

| Criterion | Result |
|---|---|
| One command rebuilds everything from `raw/`; two runs are byte-identical | ✓ `python3 pipeline/build.py`; `fetch.py` restores `raw/` from the lock (checked from empty in phase 2) |
| `validation.json` has no errors, and every warning is explained | ✓ 0 errors; the warnings are explained in §11 |
| All the tests pass | ✓ 22 Node tests (`node --test tests/*.test.mjs`) |
| Every existing feature works as before | ✓ browser checks on desktop and iPhone, no console errors: the step-1 checks, the v2 checks for each switch-over step, the mocked NASB/ESV check. The one intended change: every translation reads in its own numbering |
| Opening a chapter loads no more than after step 1 | ✓ John 1: 0.213 MB (0.047 MB gzipped) vs 0.677 MB (0.198 MB gzipped) |

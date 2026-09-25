# Berea v2 data architecture: plan

Status: phase 2 (sources) done, see §10. Phase 1 (plan) approved with the §9 recommendations. The decisions in the step-2 brief are fixed: TVTMS Expanded
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
tests/*.test.mjs             Node tests (`node --test tests/`)
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
| `remap_hebrew` Neh 7:68 fix, `SPLIT_BEFORE` | the engine uses the Expanded section, which has the detailed Neh rows; Ps 13:6 becomes `[[split]]` in `original/hbo/manifest.toml` |
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
- After the TVTMS step, pivot EST 10:4–16:24 → ADE (same ch:v) and pivot BAR 6:v → LJE 1:v. As a result
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

[[split]]                        # word sources only: where a native verse divides between pivots
ref = "PSA 13:6"
before = "H7891"                 # default: after the atnach (Hebrew), at the midpoint otherwise
```

`[[split]]` and `to = "drop"` are the two additions to the brief's format. Both are needed to carry over
today's `SPLIT_BEFORE` and the 5 dropped fathers refs.

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
  WEB's LJE is chapter 1.
- TAGNT numbers words within the NRSV verse, so under NA numbering (Mark 12:14–15) word numbers repeat.
  Each word row keeps the raw ref in `alt` (e.g. `12.15(12.14)`), which is what rebuilt today's KJV keying
  exactly.

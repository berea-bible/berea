# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Berea: a static Bible reading app (all 66 books). Five public-domain
translations (KJV, ASV, WEB, YLT, DRA; YLT is NT-only), word-level Hebrew/Aramaic
(OT) and Greek (NT) text with a Strong's-tagged lexicon, per-verse translation comparison, and early-church-father citations
(c. 100–800 AD). An optional sixth translation, NASB (1995), can be wired up
live via an already-deployed Cloudflare Worker proxy in front of
api.bible (maintained outside this repo).

## Repository layout

index.html Markup only; links the stylesheets and loads js/main.js.
css/
base.css Theme tokens (light/dark), reset, typography,
shared .loading/.empty-state.
reader.css App shell, top bar with book/chapter pickers,
reading column,
original-language line (Greek, or RTL Hebrew), mobile layout.
panel.css Verse detail panel and lexicon popover.
js/ Native ES modules, no bundler.
main.js Entry point: theme toggle, boot.
app.js Shared core: `state`, prefs, DOM refs (`el`),
escapeHtml.
data.js Fetching/caching of data/*.json, NASB proxy
(`NASB_CONFIG`, `USFM_ID`, ensureNasbChapter).
reader.js Book/chapter pickers (dropdown; full-screen
at <=640px), top-bar controls, chapter rendering.
panel.js Verse detail panel (Compare/Greek-or-Hebrew/Commentary).
greek.js Original-language helpers: Greek and Hebrew/Aramaic
morphology decoders, word display, lexicon popover.
data/ Static JSON the app fetches at runtime.
books-index.json Canonical 66-book list (OT then NT), chapter/verse
counts, translation display names, father stats,
`otBookIds`, and `ntOnlyTranslations` (e.g. YLT).
<bookid>.json One file per book (e.g. gen.json, john.json).
Each holds: translations (KJV/ASV/WEB/YLT/DRA
text by chapter/verse), greek (per-verse tagged
original-language words — Greek for NT books,
Hebrew/Aramaic for OT books despite the key name),
fathers (verse -> quote indices), quotes
(deduplicated patristic citation objects).
lexicon.json Strong's-number-keyed lexicon: G#### Greek,
H#### Hebrew/Aramaic entries.
pipeline/ Offline data tooling (not served): build_dra.py,
versification.py; see pipeline/README.md.
README.md Project overview and local/GitHub Pages hosting.


There is no build step, no package.json, no bundler. `index.html`, `css/`,
and `js/` are served as-is (JS as native `<script type="module">`);
`data/*.json` is fetched with plain `fetch()`. Any local server works
for testing (`python3 -m http.server`) — opening via `file://` does not,
because browsers block `fetch()` and module imports of local files under
that scheme.

## Working in the app code (`index.html`, `css/`, `js/`)

- Files are split by high-level feature (reader, panel, Greek, data), not
  per component. Add code to the file whose feature it belongs to; only
  add a new file for a genuinely new feature area. Don't add a build step —
  the whole point is zero-install GitHub Pages hosting.
- Modules import each other directly (`./app.js` etc.). Keep `app.js` and
  `data.js` free of UI-feature imports so they stay at the bottom of the
  dependency graph.
- State lives in a single `state` object; per-viewer prefs persist to
  `localStorage` under the key `verbum-prefs` (book, chapter, translation,
  Greek-line toggle, theme), wrapped in try/catch since storage can throw
  or be unavailable. The saved theme is also applied by a tiny inline
  script in `index.html`'s head so there's no theme flash before modules run.
- Data is loaded lazily and cached in module-scope objects (`bookCache`,
  `lexicon`) — a book's JSON is fetched once per session, not per chapter.
- `NASB_CONFIG` (in `js/data.js`) holds `proxyUrl` and
  `bibleId`. When either is empty, NASB is simply absent from the
  translation dropdown — no modal, no dead UI, no error state. Never
  reintroduce client-side API key storage or entry; that was deliberately
  removed in favor of the Worker proxy, which holds the key server-side.
  Don't hardcode any API key into the app code, a commit, or a chat
  response.
- Keep api.bible traffic minimal. `ensureNasbChapter()` makes **one
  `/chapters/{USFM}.{ch}` request per chapter** (never per verse) and nothing
  is prefetched: the reader fetches only when NASB is the selected
  translation, and the Compare tab shows a **Load** button unless the
  chapter is already cached (`getCachedNasbChapter()` never touches the
  network). Fetched chapters are cached in IndexedDB (`berea-cache` /
  `nasb`, key `{bibleId}:{bookId}.{ch}`, value `{verses, fumsToken, fetchedAt}`); per
  the api.bible agreement, entries older than 30 days are dropped on read
  and swept at boot by `purgeExpiredNasb()`. All IndexedDB access must fail
  soft (fall back to memory + network).
- api.bible terms §7: wherever NASB text is displayed (end of an NASB
  chapter, the Compare row), show `NASB_NOTICE_HTML` (`js/data.js`) — the
  short copyright line, an API.Bible credit, and a link to the full notice
  in `copyright.html#nasb`. Any new place that renders NASB text needs it too.
- api.bible terms §14 (FUMS) is mandatory for webapps: every display of NASB
  text must call `reportNasbView(bookId, chapter)` (`js/data.js`), which sends
  the chapter's `fumsToken` (stored with the IndexedDB entry, so cached
  displays are reported too) to `https://fums.api.bible/f3` with an anonymous
  device id (localStorage `fums.dId`) and session id (sessionStorage
  `fums.sId`); offline reports queue under `fums.report.*` and flush at boot
  / on `online`. Currently called once per NASB chapter shown in the reader
  (not on Greek-line re-renders) and whenever the Compare row shows NASB text.
  This speaks the documented FUMS v3 HTTP protocol directly — don't vendor or
  load `pkg.api.bible/fumsV3.min.js` (unlicensed, changes, third-party JS).
- ESV is the second live translation, via the same Worker's `/esv/*` route
  (the Worker adds the api.esv.org token; `ESV_CONFIG.proxyUrl` empty hides
  ESV everywhere, like NASB). `ensureEsvChapter()` makes **one**
  `/esv/v3/passage/text/?q=<Book> <ch>` request per chapter and parses the
  `[N]` markers in `passages[0]`; nothing is prefetched, and the Compare tab
  uses the same **Load** button. ESV API terms, which are stricter than
  NASB's and must hold:
  - **Cache at most 500 verses in total.** The `verbum-esv-cache`
    localStorage cache (mirrored in memory) evicts whole oldest chapters after
    each insert until at or under `ESV_CACHE_MAX_VERSES = 500`. It's a hard
    ToS limit, not a tunable. There's no 30-day expiry for ESV.
  - **Rate limits:** 5,000 queries/day, 1,000/hour, 60/minute. **Non-commercial
    use only** (no charging, ads or sponsorships).
  - **Notice and link on every page:** show `ESV_NOTICE_HTML` (links
    www.esv.org) wherever ESV text appears. That's under the `chapter-sub`
    line in the reader, and in the Compare row. `copyright.html#esv` carries
    ESV's required copyright-page notice.
  - **Half-book rule:** queries and display are capped at 500 verses or half a
    book. Single- and double-chapter books (Obadiah, Philemon, 2–3 John, Jude,
    Haggai) are exempt per the query rule and are shown in full.
  - No FUMS for ESV. `LIVE_TRANSLATIONS` in `js/data.js` is the one table the
    reader (`showChapter`) and panel (`renderLiveRow`) use for NASB and ESV.
    Add any further live translation there.
- `decodeMorph(m, hebrew)` (in `js/greek.js`) parses Robinson/Tyndale-style
  Greek codes (e.g. `N-GSM-P`, `V-PAI-3P`) or, when `hebrew` is true, OSHB
  Hebrew/Aramaic codes (e.g. `HR/Ncfsa`, `AVpi1cp`: language prefix, then
  `/`-separated segments). Callers pass `isOT(bookId)` — don't sniff the
  code, the two schemes overlap. If new tag combinations appear in the
  data, extend the `MORPH_*` / `HEB_*` lookup tables rather than
  special-casing strings elsewhere.
- OT words carry `/` morpheme separators and cantillation marks; always
  render them through `displayWord()` (strips both, keeps vowel points).
  Hebrew containers get `dir="rtl"` and the `hebrew` class (Noto Serif Hebrew).
- Translation availability is per book: use `translationAvailable()` /
  `effectiveTranslation()` from `js/data.js` rather than reading
  `state.translation` directly when rendering, so an NT-only pick (YLT)
  falls back to KJV in the OT without overwriting the viewer's preference.
- Book IDs (`gen`, `exod`, ..., `mal`, `matt`, ..., `rev`) are the canonical identifiers used
  across `data/`, `USFM_ID` (for NASB/api.bible lookups), and the book picker.
  Don't introduce a second book-naming scheme.

## Regenerating `data/`

The JSON in `data/` is the output of a one-time pipeline (not included in
this repo) that combined: public-domain translation texts, a tagged Greek
NT with Strong's numbers, a Greek-English lexicon, and a patristic-writings
corpus filtered to genuine early-church sources (excluding pseudepigrapha,
condemned/heretical writings, and anything post-800 AD or post-Reformation).
If asked to regenerate or extend this data, ask where the source corpora
live before attempting to re-derive the pipeline from scratch.

OT Hebrew in `data/` is keyed to KJV (English) verse numbering, like the
translations, `verseCounts`, and fathers. The pipeline's output used Hebrew
(BHS/MT) numbering, so it was re-keyed once using STEPBible TVTMS
(CC BY 4.0), with the detailed KJV/Hebrew tables overriding the summary
list where they disagree (Neh 7:68-69). Result: every OT chapter's Hebrew
verse keys match `translations.KJV`, except Neh 7:68, which has no Hebrew.
Any regenerated OT data must be remapped the same way.

The DRA is the exception: it is rebuilt by `pipeline/build_dra.py` (see
`pipeline/README.md`) from eBible.org's Douay-Rheims 1899 (Vulgate order),
re-keyed to KJV numbering with the Copenhagen Alliance mappings (`vul.json`
composed with the inverse of `eng.json`, in `pipeline/versification.py`),
plus reviewed per-verse overrides where the 1899 DRA divides verses
differently. Psalm titles are prefixed onto verse 1; where one DRA verse
covers two KJV verses its text sits on the first. Change DRA text or
alignment by editing the pipeline and re-running it, not by hand-editing
`data/`. Don't reintroduce open-bibles' `eng-dra.zefania.xml` (not Vulgate
order; contains placeholders and lost verses). The pipeline is offline
Python (stdlib only) and not part of the served app.

## Conventions

- No external JS/CSS dependencies beyond Google Fonts (`Spectral`, `Source
  Serif 4`, `Gentium Plus`, `Inter`, `Noto Serif Hebrew`, `GFS Didot` for the wordmark) — keep it that way so the page keeps
  working as a plain static file indefinitely.
- Prefer targeted edits over rewriting files wholesale; they're easier to
  review. A full rewrite is reasonable only for large structural changes.
- Don't add a bundler, framework, or `node_modules` — this app's whole
  value proposition is "clone/download, open `index.html` locally or push
  to GitHub Pages, done."
- Don't bundle NASB (or any other still-copyrighted translation) text into
  `data/`. Only public-domain translations belong there; anything else
  must go through a live API, as NASB does.

## Testing

There's no test suite. Sanity-check changes by serving the directory
locally and exercising the app in a browser (or headless via Playwright):

```bash
python3 -m http.server 8000
```

Then verify, in both an OT book (e.g. Genesis, Psalms) and an NT book:
book/chapter pickers (desktop dropdown and full-screen at phone width),
prev/next chapter, translation switching (YLT absent in the OT and restored
in the NT), the Greek/Hebrew interlinear toggle (Hebrew runs right to
left), the verse detail panel's three tabs (Compare / Greek-or-Hebrew /
Fathers), and the lexicon popover on a word click. If NASB config is
empty, confirm NASB is absent from the translation list and nothing throws
a console error.
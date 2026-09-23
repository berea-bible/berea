# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Berea: a static New Testament reading app. Five public-domain translations
(KJV, ASV, WEB, YLT, DRA), word-level Greek text with a Strong's-tagged
lexicon, per-verse translation comparison, and early-church-father citations
(c. 100–800 AD). An optional sixth translation, NASB (1995), can be wired up
live via a Cloudflare Worker proxy in front of api.bible — see
`cloudflare-worker/README` notes below.

## Repository layout

index.html Markup only; links the stylesheets and loads js/main.js.
css/
base.css Theme tokens (light/dark), reset, typography,
shared .loading/.empty-state.
reader.css App shell, nav rail, top bar, reading column,
Greek line, mobile layout.
panel.css Verse detail panel and lexicon popover.
js/ Native ES modules, no bundler.
main.js Entry point: theme toggle, boot.
app.js Shared core: `state`, prefs, DOM refs (`el`),
escapeHtml.
data.js Fetching/caching of data/*.json, NASB proxy
(`NASB_CONFIG`, `USFM_ID`, ensureNasbChapter).
reader.js Nav rail, top-bar controls, chapter rendering.
panel.js Verse detail panel (Compare/Greek/Commentary).
greek.js Morphology decoder and lexicon popover.
data/ Static JSON the app fetches at runtime.
books-index.json Canonical 27-book list, chapter/verse counts,
translation display names, father stats.
<bookid>.json One file per NT book (e.g. john.json, 1cor.json).
Each holds: translations (KJV/ASV/WEB/YLT/DRA
text by chapter/verse), greek (per-verse tagged
Greek words), fathers (verse -> quote indices),
quotes (deduplicated patristic citation objects).
lexicon.json Strong's-number-keyed Greek lexicon entries.
cloudflare-worker/
worker.js Serverless proxy: attaches an api.bible key
(server-side secret) to requests so the browser
never holds it. See README.md for deploy steps.
README.md End-user hosting instructions (GitHub Pages) and
NASB/Worker setup walkthrough.


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
  removed in favor of the Cloudflare Worker proxy. Don't hardcode any API
  key into the app code, a commit, or a chat response — it belongs only in
  the Worker's encrypted secret.
- `decodeMorph()` (in `js/greek.js`) parses Robinson/Tyndale-style morphology codes (e.g.
  `N-GSM-P`, `V-PAI-3P`) into readable labels. If new tag combinations
  appear in the data, extend the `MORPH_*` lookup tables rather than
  special-casing strings elsewhere.
- Book IDs (`matt`, `mark`, ..., `rev`) are the canonical identifiers used
  across `data/`, `USFM_ID` (for NASB/api.bible lookups), and the nav.
  Don't introduce a second book-naming scheme.

## Working with `cloudflare-worker/worker.js`

- This is the only place an api.bible key should ever be referenced, and
  only as `env.API_BIBLE_KEY` (a Cloudflare secret set via the dashboard
  or `wrangler secret put`), never as a literal string.
- The Worker is a thin `/v1/*` passthrough to `https://rest.api.bible`
  with CORS headers added. Keep it minimal — this is a security boundary,
  not a place for app logic.
- `ALLOWED_ORIGIN` defaults to `"*"`; production deployments should be
  told to tighten it to their actual GitHub Pages origin (documented in
  the main README).

## Regenerating `data/`

The JSON in `data/` is the output of a one-time pipeline (not included in
this repo) that combined: public-domain translation texts, a tagged Greek
NT with Strong's numbers, a Greek-English lexicon, and a patristic-writings
corpus filtered to genuine early-church sources (excluding pseudepigrapha,
condemned/heretical writings, and anything post-800 AD or post-Reformation).
If asked to regenerate or extend this data, ask where the source corpora
live before attempting to re-derive the pipeline from scratch.

## Conventions

- No external JS/CSS dependencies beyond Google Fonts (`Spectral`, `Source
  Serif 4`, `Gentium Plus`, `Inter`) — keep it that way so the page keeps
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

Then verify: chapter navigation, translation switching, the Greek
interlinear toggle, the verse detail panel's three tabs (Compare / Greek /
Fathers), and the lexicon popover on a Greek word click. If NASB config is
empty, confirm NASB is absent from the translation list and nothing throws
a console error.
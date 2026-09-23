<p align="center">
  <a href="https://berea-bible.github.io/reader/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="./.github/banner-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="./.github/banner-light.svg">
      <img alt="Berea" src="./.github/banner-light.svg" width="600">
    </picture>
  </a>
</p>

<p align="center">
  <em>A New Testament reader with the Greek text, five translations, and the early Church Fathers.</em>
</p>

<p align="center">
  <a href="https://berea-bible.github.io/reader/"><strong>Open the reader →</strong></a>
</p>

---

## Features

**Five public-domain translations.** Switch between translations for the whole chapter, or open any verse to compare them all side by side.

| | |
|---|---|
| **KJV** | King James Version (1611/1769) |
| **ASV** | American Standard Version (1901) |
| **WEB** | World English Bible |
| **YLT** | Young's Literal Translation (1898) |
| **DRA** | Douay-Rheims (Challoner revision) |

The NASB (1995) is also available. It is fetched live through a small proxy and is never bundled with the app.

**Greek, word by word.** Turn on the interlinear line to show the Greek under each verse. Tap any Greek word to see its Strong's number, its parsed morphology (e.g. *verb, present active indicative, 3rd person plural*), and its lexicon definition.

**The Church Fathers.** Each verse lists what early Christian writers (c. 100–800 AD) said about it: **41,000+ quotations from 185 authors**.

**No accounts, no tracking, no build step.** It's plain HTML, CSS, and JavaScript. Your place, translation, and theme are saved in your browser.

## Run it locally

```bash
git clone https://github.com/berea-bible/reader.git
cd reader
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Any static file server works. Opening `index.html` directly with `file://` does not, because browsers block its data requests.

## Project layout

```
index.html        page markup
css/              theme, reader layout, verse panel
js/               native ES modules (no bundler)
data/             one JSON file per book, plus the index and Greek lexicon
```

To host your own copy, push the repository to GitHub and turn on **Pages** for the main branch.

## License

The code is under the [MIT](LICENSE) license. The bundled translations are all in the public domain.

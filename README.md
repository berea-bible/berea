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
  <em>A Bible reader with the Hebrew and Greek texts, five translations, and the early Church Fathers.</em>
</p>

<p align="center">
  <a href="https://berea-bible.github.io/reader/"><strong>Open the reader →</strong></a>
</p>

---

## Features

**All 66 books, five public-domain translations.** Switch between translations for the whole chapter, or open any verse to compare them all side by side. (YLT is New Testament only.)

| | |
|---|---|
| **KJV** | King James Version (1611/1769) |
| **ASV** | American Standard Version (1901) |
| **WEB** | World English Bible |
| **YLT** | Young's Literal Translation (1898) |
| **DRA** | Douay-Rheims (Challoner revision) |

The NASB (1995) is also available. It is fetched live through a small proxy and is never bundled with the app.

**Hebrew and Greek, word by word.** Turn on the interlinear line to show the original language under each verse: Hebrew (and Aramaic) for the Old Testament, Greek for the New. Tap any word to see its Strong's number, its parsed morphology (e.g. *verb, qal perfect, 3rd person masculine singular*), and its lexicon definition.

**The Church Fathers.** Each verse lists what early Christian writers (c. 100–800 AD) said about it: **65,000+ quotations from 231 authors**.

**No accounts, no ads, no build step.** It's plain HTML, CSS, and JavaScript. Your place, translation, and theme are saved in your browser. The only usage reporting is the anonymous view count that API.Bible requires when you read the NASB (see [Copyright](copyright.html#nasb)); the public-domain translations send nothing.

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
data/             one JSON file per book, plus the index and Hebrew/Greek lexicon
```

To host your own copy, push the repository to GitHub and turn on **Pages** for the main branch.

## License

The code is under the [MIT](LICENSE) license. The bundled translations are all in the public domain.

Old Testament verse alignment between the Hebrew and English numbering uses the [STEPBible TVTMS](https://github.com/STEPBible/STEPBible-Data) versification data by Tyndale House, Cambridge ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).

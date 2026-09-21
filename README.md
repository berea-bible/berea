# Berea — New Testament reading app

[https://www.mcmichen.cc/berea](mcmichen.cc/berea)

A static web app: five translations, word-level Greek with lexicon definitions,
verse comparison, and early church father citations. No build step, no server
code — just `index.html` plus the JSON files in `data/`.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

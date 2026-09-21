# Berea — New Testament reading app

A static web app: five translations, word-level Greek with lexicon definitions,
verse comparison, and early church father citations. No build step, no server
code — just `index.html` plus the JSON files in `data/`.

## Host it on GitHub Pages

1. Create a new repo on GitHub (e.g. `berea`).
2. Add these files to it — either drag-and-drop this folder's contents in the
   GitHub web UI, or from a terminal:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages** → under "Build and deployment", set
   **Source** to "Deploy from a branch", branch **main**, folder **/ (root)**.
   Save.
4. GitHub gives you a URL a minute or two later, typically
   `https://<your-username>.github.io/<your-repo>/`.

That's it — everything the app needs (translations, Greek text, lexicon,
patristic citations) is already in `data/`, so there's nothing else to
configure or any API key to add.

## Running it locally first (optional)

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (Opening `index.html` directly via
`file://` won't work — browsers block `fetch()` of local JSON files under
that protocol — a local server, or GitHub Pages itself, is required.)

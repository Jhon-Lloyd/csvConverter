# Guest List Converter

A static website that turns a **Luma guest export (.csv)** into a check-in sheet.
Everything runs in the browser, so the guest list is never uploaded anywhere.

## What it does

1. Upload the CSV downloaded from Luma.
2. The page keeps only these 6 columns, in this order:

   | first_name | last_name | email | created_at | checked_in | ticket_venue |
   |---|---|---|---|---|---|

   - `checked_in` — `TRUE` if Luma's `checked_in_at` has a date, otherwise `FALSE`.
   - `ticket_venue` — new column, filled with `In-person` (editable on the page).
3. Guests whose `approval_status` is `invited` are removed from the copy and
   not counted in the totals (they stay in the original sheet).
4. Rows are sorted: checked-in guests first (earliest check-in first), then
   the rest (newest registration first).
5. Download:
   - **Excel (.xlsx)** with two sheets: the original data untouched, and
     `Copy of <file name>` with the 6 columns. Excel caps sheet names at 31
     characters, so long names are shortened inside the file.
   - **CSV** containing only the 6-column copy, named `Copy of <file name>.csv`.

## Publish with GitHub Pages

1. Merge this branch into `main`.
2. In the repo on GitHub: **Settings → Pages → Build and deployment**,
   choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. After a minute the site is live at `https://<user>.github.io/<repo>/`.

## Develop

No build step and no dependencies.

```sh
npm test      # unit tests (Node 18+)
npm start     # serve locally at http://localhost:8080
```

The page uses ES modules, so open it through a web server (as above), not
by double-clicking `index.html`.

| File | Purpose |
|---|---|
| `index.html`, `css/style.css` | Page and Google-style theme (light/dark) |
| `js/app.js` | Upload, preview and download wiring |
| `js/convert.js` | Column selection, TRUE/FALSE, sorting |
| `js/csv.js` | CSV parse/write |
| `js/xlsx.js` | Minimal .xlsx writer |

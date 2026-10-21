# docs/

Supporting documents for the Puong project.

| File | Purpose | Due |
|---|---|---|
| `SRS.md` | Software Requirements Specification (ISO/IEC/IEEE 29148) | M0 working document |
| `SRS.pdf` | Rendered A4 PDF of `SRS.md` — **9 pages** | — |
| `print.css` | A4 print stylesheet used to render the PDF | — |
| `api.md` | REST API contract: method, path, caller, body, success, errors | M2 |
| `erd.md` | Entity-relationship diagram | M2 |
| `wireframes/` | Screen wireframes | M1 |

## Printing the SRS as A4

`SRS.md` is written to land on **9 A4 pages** with the stylesheet in `print.css`
(11 pt body, 1.38 line height, 13 mm top / 13 mm side margins). Verified against four
different render settings: 9 pages with `print.css`, 10 pages with Word's default
margins and line height, 10 pages with pandoc's defaults, 9 pages with a compressed
print layout.

### Option 1 — VS Code (easiest)

Install the **Markdown PDF** extension, then add this front matter to `SRS.md`:

```markdown
---
pdf:
  - css: docs/print.css
---
```

Or use **Markdown Preview Enhanced** → right-click the preview → *Export File* → *Chrome (Puppeteer)*, and paste `print.css` into *Include stylesheet*.

### Option 2 — pandoc

```bash
pandoc docs/SRS.md -o docs/SRS.pdf \
  --css=docs/print.css \
  --pdf-engine=weasyprint \
  --metadata title="Puong — Software Requirements Specification"
```

`weasyprint` is a pure-Python renderer:

```bash
pip install weasyprint
```

### Option 3 — Google Docs or Word

1. Open `SRS.md` in a Markdown editor (or VS Code) and copy the rendered output.
2. Paste into Google Docs / Word.
3. Set **File → Page setup**: A4, margins **top 1.3 cm, bottom 1.4 cm, left/right 1.3 cm**.
4. Set body text to **11 pt Segoe UI** (or Arial) with **1.38 line spacing**.

> With Word's *default* 2.5 cm margins and 1.5 line spacing the document renders to
> 10 pages — still inside the budget, but the settings above give the intended 9.

### Verifying the page count

```bash
# macOS
mdls -name kMDItemNumberOfPages docs/SRS.pdf
# Linux
pdfinfo docs/SRS.pdf | grep Pages
```

# docs/

Supporting documents for the Puong project.

| File | Purpose |
|---|---|
| **`Puong-SRS.pdf`** | **Submission-ready Software Requirements Specification — 9 A4 pages. Fully self-contained: it references no other file in this repository and can be submitted or printed on its own.** |
| `SRS.md` | The source of `Puong-SRS.pdf`, in Markdown. |
| `print.css` | A4 print stylesheet used to render the PDF. |

## The submission PDF

`Puong-SRS.pdf` is generated from `SRS.md` using `print.css`. It stands alone:

- no references to `PROPOSAL.md`, `api.md`, `erd.md`, `MILESTONES.md` or `README.md`
- the ten user stories are reproduced in §2.3, so §4's traceability matrix is self-explanatory
- §1.4 lists only external standards (IEEE 29148, RFC 7519, RFC 9110, RFC 6749, OWASP ASVS)
- §5 "Domain reference" holds the test accounts and the domain glossary, and nothing else

Page count was measured by rendering with headless Chrome and reading the PDF page count,
not estimated. Verified across four renderer settings:

| Renderer settings | Pages |
|---|---|
| `print.css` (10.5 pt, 1.40 line height, 12 mm margins) | **9** |
| Word default (11 pt, 1.5 line height, 25 mm margins) | 10 |
| pandoc default (11 pt, 1.4 line height, 20 mm margins) | 10 |
| Compressed print (10 pt, 1.3 line height, 12 mm margins) | 9 |

## Regenerating the PDF

### VS Code (easiest)

Install the **Markdown PDF** extension, then add this front matter to `SRS.md`:

```markdown
---
pdf:
  - css: docs/print.css
---
```

### pandoc

```bash
pip install weasyprint
pandoc docs/SRS.md -o docs/Puong-SRS.pdf \
  --css=docs/print.css \
  --pdf-engine=weasyprint \
  --metadata title="Puong — Software Requirements Specification"
```

### Google Docs or Word

1. Open `SRS.md` in a Markdown editor and copy the rendered output.
2. Paste into Google Docs / Word.
3. Set **File → Page setup**: A4, margins **top 1.2 cm, bottom 1.3 cm, left/right 1.2 cm**.
4. Set body text to **10.5 pt Segoe UI** (or Arial) with **1.40 line spacing**.

> Word's *default* 2.5 cm margins and 1.5 line spacing render the document to 10 pages —
> still inside the 8–10 page budget, but the settings above give the intended 9.

### Verifying the page count

```bash
pdfinfo docs/Puong-SRS.pdf | grep Pages     # Linux
mdls -name kMDItemNumberOfPages docs/Puong-SRS.pdf   # macOS
```

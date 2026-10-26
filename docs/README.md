# docs/

Supporting documents for the Puong project.

| File | Purpose |
|---|---|
| **`IP_Project_Proposal_p20240044.pdf`** | **Submission-ready Software Requirements Specification — 10 A4 pages. Fully self-contained: it references no other file in this repository and can be submitted or printed on its own.** |
| `SRS.md` | The source of the PDF, in Markdown. |
| `print.css` | A4 print stylesheet used to render the PDF. |
| `render-pdf.js` | The exact script that produced the shipped PDF. |
| `design.md` | Design decisions for M1–M4: where a parentless person is placed, the role × action permission matrix, the six routes, the memory-form validation rules, what is out of scope. |
| `api.md` | The API contract: one row per endpoint — who may call it, the body, the success, the possible errors — plus the session, the 401/403/404 rules and the error format (M2, rewritten at M3). |
| `erd.md` | The ERD, generated from `api/prisma/schema.prisma` by `erd/build.mjs`. |
| `security.md` | The week 9 security checklist run on this application: what was fixed, what is listed as a known gap, and what does not apply (M3). |
| `m1-explain.md` | The graded M1 answer: what state lives in the Pinia store and what stays inside a component, and why. |
| `wireframes.md` | Seven annotated wireframe sheets — the six main screens plus loading/empty/error (M1 checklist item). |
| `wireframes/` | The SVG sheets themselves and `build.mjs`, which regenerates them from the route table in `design.md` §3. |

## The submission PDF

The PDF is generated from `SRS.md` using `print.css`. It stands alone:

- no references to `PROPOSAL.md`, `api.md`, `erd.md`, `MILESTONES.md` or `README.md`
- the ten user stories are reproduced in §2.3, so §4's traceability matrix is self-explanatory
- §1.4 lists only external standards (IEEE 29148, RFC 7519, RFC 9110, RFC 6749, OWASP ASVS)
- §5 "Domain reference" holds the test accounts and the domain glossary, and nothing else

It carries a title table with the author, student ID, course and lecturer, a running
date header on every page, and PDF bookmarks generated from the headings.

Page count was measured by rendering with headless Chrome and reading the PDF page
count, not estimated. Verified across four renderer settings:

| Renderer settings | Pages |
|---|---|
| `print.css` (10.5 pt, 1.40 line height, 12 mm margins) | **10** |
| Word default (11 pt, 1.5 line height, 25 mm margins) | 10 |
| pandoc default (11 pt, 1.4 line height, 20 mm margins) | 10 |
| Compressed print (10 pt, 1.3 line height, 12 mm margins) | 9 |

All four are inside the 8–10 page budget.

## Regenerating the PDF

### With the script that produced it (exact match)

The render dependencies are **not** committed to this repository (so `node_modules/`
never ends up in Git). Install them in a scratch directory and point `NODE_PATH` at it:

```bash
mkdir -p /tmp/puong-render && cd /tmp/puong-render
npm init -y && npm install puppeteer marked

cd /path/to/Puong
NODE_PATH=/tmp/puong-render/node_modules node docs/render-pdf.js \
  docs/SRS.md docs/IP_Project_Proposal_p20240044.pdf \
  docs/print.css "21 October 2026" "Puong — Software Requirements Specification"
```

The two trailing arguments are the running header printed on every page and the PDF
document title; both default sensibly if you omit them.

### VS Code

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
pandoc docs/SRS.md -o docs/IP_Project_Proposal_p20240044.pdf \
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
> still inside the 8–10 page budget, but the settings above give the intended layout.

### Verifying the page count

```bash
pdfinfo docs/IP_Project_Proposal_p20240044.pdf | grep Pages     # Linux
mdls -name kMDItemNumberOfPages docs/IP_Project_Proposal_p20240044.pdf   # macOS
```

# Stories, end to end — the M4 evidence

Every MVP story in `PROPOSAL.md`, with the commit that carries its code, the
test that exercises it, and a screenshot of it working. The screenshots are the
output of the tests, not pictures taken by hand: `npm test` in `e2e/` writes
them each time it runs, so what is in `docs/screenshots/` is what the suite
last saw.

**Reproduce it:** start the API (`cd api && node dist/src/main.js`), start the
web dev server (`cd web && npm run dev`), then `cd e2e && npm test`. The
`pretest` and `posttest` scripts re-seed the database before and after, so the
stories always read the same demo family.

**Result of the run these were taken from:** 10 passed, 1 skipped (story 8, by
decision), 0 failed — 28 screenshots.

## The matrix

| # | Story (PROPOSAL §User stories) | Requirements | Commit | Test | Screenshots |
|---|---|---|---|---|---|
| 1 | Create a family tree, find it, delete it | FR-2.1–2.4, FR-8.4 | API `8df55ee` · web `defd65b` | browser `story 1 — create a family tree, find it in the list, delete it` · API `check-api.cjs` (create → 201, short name → 400, creator deletes → 204) | `story-01-name-too-short.png`, `story-01-tree-created-empty.png`, `story-01-tree-in-the-list.png`, `story-01-tree-deleted.png` |
| 2 | Invite a relative by email, accept on the home page | FR-1.1, FR-3.1–3.3, FR-3.5 | API `8df55ee` · web `defd65b` | browser `story 2 — register an account, invite it by email, accept on the home page` · API e2e `story 2 — inviting a relative by email (FR-3)` · unit `invitation.spec` | `story-02-new-account-home.png`, `story-02-invitation-sent.png`, `story-02-invitation-on-home.png`, `story-02-invitation-accepted.png` |
| 3 | The whole tree, by generation, with the path highlighted | FR-8.1–8.3, FR-5.7 | web `defd65b` | browser `story 3 — generations, selection and the ancestor/descendant path` · web `npm run check` → `check-generations.mjs` | `story-03-tree-by-generation.png`, `story-03-ancestor-and-descendant-path.png`, `story-03-person-page.png` |
| 4 | Add a person with a name and dates | FR-4.1, FR-4.2, FR-4.4 | API `8df55ee` · web `defd65b` | browser `story 4 — add a person with a name and a birth date` · API e2e `story 4 — adding a person (FR-4)` | `story-04-name-required.png`, `story-04-person-added.png` |
| 5 | Link a relative; a loop is refused | FR-5.1–5.4, FR-5.6 | API `8df55ee` · web `defd65b` | browser `story 5 — link a person to relatives, and refuse a loop` · API e2e `story 5 — linking a person to their relatives (FR-5)` · unit `relations.service.spec`, `generations.spec` | `story-05-link-created.png`, `story-05-cycle-refused.png` |
| 6 | A memory with a photograph; a private one stays private | FR-6.1–6.3, FR-6.6, FR-6.7 | API `8df55ee` · web `defd65b` | browser `story 6 — a memory with a photograph, and a private one kept private` · API e2e `story 6 — a photograph, uploaded and served (FR-6.2, FR-6.3)` · unit `memories.service.spec` · web `check-modules.mjs` | `story-06-memory-saved.png`, `story-06-memory-on-the-person.png`, `story-06-private-invisible-to-a-viewer.png` |
| 7 | Edit and delete only my own contributions | FR-4.4, FR-4.5, FR-4.6, FR-6.4, FR-6.5 | API `8df55ee` · web `defd65b` | browser `story 7 — edit and delete only your own contributions` · API e2e `story 7 — only your own contributions (FR-4.4, FR-6.5)` · unit `memories.service.spec` | `story-07-person-edited.png`, `story-07-memory-edited.png`, `story-07-others-contributions-untouched.png`, `story-07-person-deleted.png` |
| 8 | Count of profiles still needing details | FR-4.7 | — **not built** | `test.skip` in `e2e/tests/stories.spec.ts`, with the reason in a comment — the story was cut from the MVP (`PROPOSAL.md`, *MVP scope*) and is declared here rather than quietly omitted | — **not built** |
| 9 | Search, filter, ten per page (the stretch feature) | FR-7.1–7.4 | API `8df55ee` · web `defd65b` | browser `story 9 — search, filter, and ten results a page` · API e2e `story 9 — search, filters and ten per page (FR-7)` · unit `search.service.spec` | `story-09-search-by-query.png`, `story-09-search-filtered.png`, `story-09-search-page-two.png` |
| 10 | Nominate a successor and hand the tree over | FR-9.1–9.3, FR-3.5, FR-3.6 | API `8df55ee` · web `defd65b` | browser `story 10 — nominate a successor, accept, and the ownership moves` · API e2e `story 10 — handing the tree to a successor (FR-9)` · unit `trees.service.spec` | `story-10-successor-nominated.png`, `story-10-nomination-banner.png`, `story-10-ownership-transferred.png` |
| — | Swagger serves the API's own documentation | M4 checklist | API `8df55ee` | browser `Swagger UI and the OpenAPI document are served by the API` — `/api/docs` responds, `/api/docs/json` parses, 25 paths, and the succession routes are in them | — (a document, not a screen) |

The three commits are the three layers of the application, not three releases:
**`8df55ee`** is the API (endpoints, the seven unit suites, the e2e blocks, the
contract harness), **`defd65b`** is the browser (stores, panels, forms, router),
**`9477504`** is the walkthrough itself plus the screenshots it produced.

## What each story actually showed

**Story 1 — a tree that can be taken away again.** The form refuses `A` with
*at least 2 characters* before anything is sent (US-12), the new tree opens on
its own empty state rather than a blank canvas (FR-8.4), the list shows it, and
deleting it puts the list back the way it was.

**Story 2 — an invitation that has somewhere to land.** A brand-new account is
created, the owner invites it, and the invitee's home page carries the banner
*Waiting for your answer*. The tree is deliberately **not** in their list yet
(FR-3.5). Accepting moves them into the tree — and because they now have
exactly one, the home shortcut takes them straight there.

**Story 3 — where everybody sits.** 23 people in four generation columns, one
card each. Selecting Chheng Sokuntheary reports *4 ancestors, 1 descendant* and
draws both paths (FR-8.3); the person page opens from the card with family,
relations and memories.

**Story 4 — the server's sentence, said by the browser.** Submitting the empty
form shows *A full name is required.* without a request being made — the same
string the API returns, because `utils/personValidation` and the DTO were
written from one wording. With a name and a birth date the card appears on the
canvas immediately.

**Story 5 — a link, and a link that would break the family.** A sibling link is
recorded and listed. A `PARENT` link from Chheng Sokuntheary to Mr. Mango would
close the lineage into a loop; it is answered **409** and the panel shows the
sentence, not a status code.

**Story 6 — a photograph, and a memory nobody else can see.** The 1×1 PNG is
uploaded first, its URL is then written into the memory, and the picture shows
on the person's page. Read as the viewer, the `PRIVATE` memory is simply not
there — and `/memories/new` sends the viewer back to the tree, because a form
they may not use should not render (FR-3.6).

**Story 7 — your work, and only your work.** The contributor edits the person
they created and their own memory, in place. Opening `Mr. Mango` (created by
somebody else) offers no edit button at all: a control that only ever fails is
worse than no control. Deleting their own person confirms, and the card is gone.

**Story 9 — the stretch feature, in the URL.** `?q=theary` returns 2 results;
`?relation=SPOUSE` returns 16, shown 10 at a time across *page 1 of 2* and
*page 2 of 2*. Because the query is in the address bar, that filtered list is a
link you can send to a relative.

**Story 10 — the archive outliving its owner.** The owner nominates the
contributor; the contributor, with one tree and everything pending, lands on
home instead of being carried into the tree, accepts, and the tree's settings
now read *Ownership moved from Sokuntheary Chheng to Sreypov Chheng* with the
date (US-13). One transaction wrote all of it.

## How to read a "not built"

Story 8 is the only one. It is skipped **by name**, in the same file as the ten
passing tests, with the reason attached — `PROPOSAL.md` moved it out of the MVP
before any of this was written, and the honest way to show a checklist that is
to write the missing row rather than to leave it out. FR-4.7 and FR-10.1 in
`docs/SRS.md` say the same thing in the status column.

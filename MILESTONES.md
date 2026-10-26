# Milestones

Each milestone is graded on its checklist **plus** a short written answer to the
*"Explain your design"* question under it (`wind/wind.md`, "Milestone checklists").
The answers live here, next to the checklist they belong to.

Each milestone is submitted as a **Git tag** (`m0`, `m1`, …) on this repository:

```bash
git tag m0 <the commit that finished M0>   # annotated tags: git tag -a m0 -m "M0" <sha>
git push origin m0                          # tags are not pushed with a plain git push
```

Status of the milestones so far:

| Milestone | Week | State | Tag |
|---|---|---|---|
| M0 Proposal | 3 | complete | `m0` — **not created yet** |
| M1 Frontend prototype | 5 | complete | `m1` — **not created yet** |
| M2 Backend API | 7 | complete | `m2` — **not created yet** |
| M3 Integrated app | 9 | not started | `m3` |
| M4 Feature complete | 12 | not started | `m4` |
| M5 Deployed | 14 | not started | `m5` |

---

## M0 Proposal (week 3)

- [x] `PROPOSAL.md` follows the template in Appendix A
- [x] Problem stated in two sentences; target users and at least 2 roles named
      — Owner, Contributor, Viewer, all scoped **per tree** by `Membership`, not per account
- [x] 6–10 user stories, with acceptance criteria for the 3 most important
      — ten stories; every one has acceptance criteria, and stories **3** (see the whole tree
      by generation), **5** (link a new person to relatives already recorded) and **6**
      (attach a memory and a photograph to a person) carry the product, so those three are
      the ones a reviewer should read first
- [x] MVP scope split into must-have and nice-to-have
- [x] Entity list with main attributes and relations; at least 3 entities
      — six: `User`, `Tree`, `Membership`, `Person`, `Relation`, `Memory`
- [x] Chosen stretch feature named — search, filter and pagination (10 per page)

> **Explain: Which story did you cut from the MVP, and why?**

**Story 8 — "the Owner sees which profiles are still incomplete".** Its first design stored
a status column on `Person` with three values (`PLACEHOLDER` / `INCOMPLETE` / `COMPLETE`):
a small state machine that had to be recomputed whenever a person or a photograph was
edited, plus a dashboard and a filtered screen to display the result. Cutting it forced the
better question — *what is a complete profile?* — and the answer is derivable from data the
person already has: a name, a birth date, and either a photograph or a biography. Because
the status is **derived instead of stored**, the feature costs one badge and one filter
rather than a column, a state machine, a dashboard and a screen, and it cannot fall out of
sync because there is nothing to keep in sync. (That derivation is now `FR-4.3`, so the rule
survives even though the story stayed out of the MVP.)

Five things from the first draft were cut for the plainer reason that nothing asks for them:
SVG connector lines, an "archive" state for a person, an activity list, birthday reminders,
and export to JSON/PDF. The full table with the reasoning is in `PROPOSAL.md` →
*What was cut from the MVP, and why*.

---

## M1 Frontend prototype (week 5)

- [x] Wireframes (photo or tool) of the main screens in `docs/`
      — `docs/wireframes.md` + seven SVG sheets in `docs/wireframes/`, generated from the
      route table in `docs/design.md` §3 by `docs/wireframes/build.mjs`, so a sheet cannot
      drift from the route it documents
- [x] Vue 3 + TypeScript app created with Vite; strict mode on; ESLint passes
      — `web/`, `strict: true`, `npm run lint` exits 0, `npm run typecheck` exits 0
- [x] At least 4 routes, including a detail page with a route parameter
      — six routes, two of them parameterised: `/trees/:treeId` and
      `/trees/:treeId/people/:personId` (+ `/memories/new`)
- [x] At least one form with client-side validation
      — the memory form (`MemoryFormView.vue`), rules in `src/utils/memoryValidation.ts`
      so the same rules can be unit-tested outside the component
- [x] A Pinia store and a service layer calling a mock API (json-server or local JSON)
      — four stores over `src/services/mockApi.ts`, which reads `src/mock/db.json`
- [x] Loading, empty and error states visible
      — one `AsyncState` component used by every screen; the error state is reachable on
      purpose through the "arm a one-shot failure" demo control in the footer

> **Explain: What state lives in the store and what stays inside a component? Why?**

**The store holds state more than one screen needs, or that has to survive navigation. The
component holds state that only it uses and that should disappear when it unmounts. A third
place — the route — holds anything that must survive a refresh or be shareable as a URL.**

- **Store:** the current identity (`useSessionStore`); my trees and their counts
  (`useTreesStore`); the open tree, its people, its relations and *my role in it*
  (`useTreeStore`); the memories of the person being viewed and of the open tree
  (`useMemoriesStore`); search *results*. Two screens reading one list means one copy —
  three copies means the tree view, the person page and the search results can disagree
  about who is in the tree.
- **Component:** the login fields and their errors; the memory-form draft; the open/closed
  state of a dialog; which of the two tabs is showing on the tree view; the tree canvas's
  zoom, pan and fit; a hovered card. All of these are *ways of looking at one thing* rather
  than facts about it — in the store, the next tree you open would inherit a tab and a zoom
  level chosen somewhere else, and somebody would have to write the code that clears them.
- **Route:** `?person=` (the selected person) and `?q=` / `?page=` (the search). Store state
  is lost on refresh and cannot be linked to; selecting a card is therefore a **route push**,
  never a store commit, so the URL and the screen cannot disagree.

The rule of thumb: *if two components would want it → store; if it must survive a refresh →
route; if it would be meaningless after unmount → component.* The full reasoning, the
state table and the concrete bug that justifies the split are in `docs/m1-explain.md`.

---

## M2 Backend API (week 7)

- [x] API contract (Appendix B) and ERD in `docs/`
      — `docs/api.md`: one row per endpoint with who may call it, the body, the success
      and the possible errors, then the error format, the status-code table and the
      conventions. `docs/erd.md` + `docs/erd/erd.svg` are **generated from
      `api/prisma/schema.prisma`** by `docs/erd/build.mjs`, in the style of the
      wireframe generator, so the diagram cannot describe a database that does not exist
- [x] NestJS API with one module per resource (controller, service, DTOs)
      — seven: `users`, `trees`, `memberships`, `people`, `relations`, `memories`,
      `search`, each with `*.controller.ts` (HTTP only), `*.service.ts` (all data access)
      and `dto/*.dto.ts` (validation + Swagger). `prisma.module.ts` is `@Global` so
      infrastructure is written once, and `common/api-exception.filter.ts` is the single
      place an error body is produced
- [x] Prisma schema, migrations and a seed script; PostgreSQL runs in Docker
      — `api/prisma/schema.prisma` (6 models, 5 enums, 12 relationships), migration
      `20261026050308_init`, and `prisma/seed.ts` which reads `web/src/mock/db.json` —
      the prototype's own data, not a copy — replacing the mock's placeholder password
      with a bcrypt hash of `Passw0rd!`. `docker-compose.yml` runs `db` + `api` + `web`
      with `api/Dockerfile` and `web/Dockerfile`; **this milestone was built and verified
      against a local PostgreSQL 16, because this WSL distro has no Docker** — the
      compose file is written but has not been run
- [x] CRUD endpoints for at least 3 entities, with server-side validation
      — six resources; full create/read/update/delete on trees, people and memories,
      read/create/delete on relations, read/create/update/delete on memberships, and
      read/create/update on users (no delete, by design — see `docs/api.md`). Every DTO
      validates with `class-validator` under a global `ValidationPipe`
      (`whitelist`, `transform`, `forbidNonWhitelisted`)
- [x] Correct status codes (200, 201, 204, 400, 404) and consistent error JSON
      — every `DELETE` is `@HttpCode(204)`; errors are always
      `{ statusCode, message: string[], error }` from one filter; 409 for a unique
      constraint, 400 for a bad foreign key, 500 with no schema leaked. Verified end to
      end by a 112-assertion script over every endpoint, plus three e2e tests
      (`npm run test:e2e`), `npm run lint`, `npm run typecheck` and `npm run build`

> **Explain: Why did you choose this relation (1-N or N-N) between two of your entities?**

*(the design answer is already settled in `PROPOSAL.md` → "Why these relations"; it is
restated here because this milestone's question asks for it)*

**`User` ↔ `Tree` is many-to-many through `Membership`.** A person belongs to their own
family tree *and* to their partner's, and one tree has many members. The join table is not
just a bridge: it carries `role` and invitation `status`, so "what may this user do in this
tree" has exactly one source of truth. A `role` column on `User` would only work for one
tree, and a `role` on `Tree` would give every member the same rights.

The counter-example is **`Tree` → `Person`, which is one-to-many**: a person belongs to
exactly one tree, so a foreign key on `Person` is enough and every tree query is a single
indexed lookup. Choosing N-N there would mean a join table for data that never has a second
side.

---

## M3 Integrated app (week 9)

- [ ] Frontend calls the real API; the mock is gone
- [ ] Registration, login, logout; passwords hashed
- [ ] Guards on the API for authentication, roles and ownership
- [ ] Route guards in Vue; the UI hides what a role cannot do
- [ ] Security checklist from week 9 run on your app; findings fixed or listed
- [ ] 3-minute demo in the practice session

> **Explain: Where is the token stored in the browser, and what attack does that choice
> protect against or expose?**

---

## M4 Feature complete (week 12)

- [ ] Every MVP user story works end to end
- [ ] Stretch feature implemented
- [ ] Unit tests for core services; e2e tests for the main endpoints; all green
- [ ] Swagger documentation available

> **Explain: Pick one test. What bug would it catch?**

---

## M5 Deployed (week 14)

- [ ] Dockerfiles for frontend and backend; `docker-compose.yml` for the whole stack
- [ ] Running on the school server with HTTPS, or starting locally with one `docker compose up`
- [ ] GitHub Actions workflow runs lint, tests and build on every push
- [ ] README complete (Appendix B); no secrets in the repository

> **Explain: What happens, step by step, between `git push` and your change being live?**

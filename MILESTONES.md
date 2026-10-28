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
| M0 Proposal | 3 | complete | `m0` → `85a82d6` |
| M1 Frontend prototype | 5 | complete | `m1` → `1bd5a7f` |
| M2 Backend API | 7 | complete | `m2` → `4955663` |
| M3 Integrated app | 9 | complete | `m3` → `38d1894` |
| M4 Feature complete | 12 | complete | `m4` → `1d34df1` |
| M5 Deployed | 14 | not started | `m5` |

All five existing tags are annotated and **local only** — nothing has been
pushed (`git tag -l` to list them, `git rev-parse 'm4^{commit}'` to resolve
one). The working branch is `m3-work`, so the ref `m3` names the tag alone
and `git show m3` needs no disambiguating.

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

- [x] Frontend calls the real API; the mock is gone
      — `web/src/services/mockApi.ts` and `web/src/mock/types.ts` are deleted; every store now
      goes through `web/src/services/api.ts`, a `fetch` client with one base path (`/api`),
      `credentials: 'same-origin'` and one error type (`ApiError`). `web/src/mock/db.json`
      survives on purpose: it is no longer a mock database, it is the seed dataset
      `api/prisma/seed.ts` loads. No store imports it. Verified by
      `web/scripts/checks/serviceLayer.test.mjs` (36 assertions over the client, including
      that no request anywhere carries `viewerId`, `authorId`, `createdById`, `ownerId` or a
      token), plus `npm run lint`, `npm run typecheck`, `npm run check`, `npm run build`
- [x] Registration, login, logout; passwords hashed
      — `POST /api/auth/register|login|logout` with bcrypt (cost 10); a failed login is one
      401 with one sentence whether the email exists or not. The browser side is
      `/login` (two modes, `?next=` return, `ApiError` shown) and `useSessionStore`, which
      keeps only the *account* — the session itself is a cookie it cannot read
- [x] Guards on the API for authentication, roles and ownership
      — `AuthGuard` on `APP_GUARD`, `@Public()` only on register/login/logout;
      `TreeRoleGuard` + `@RequireRole(VIEWER|CONTRIBUTOR|OWNER)` per tree; ownership checked
      against the loaded row (memory author, person creator, your own account row). 404 for
      "not a member / not yours to see", 403 for "member, but not enough" —
      see `docs/api.md` → *401 vs 403 vs 404*. Evidence: `npm run check` → **192 passed**,
      `npm run test:e2e` → **13 passed**, both green three times in a row
- [x] Route guards in Vue; the UI hides what a role cannot do
      — `router.beforeEach` awaits the memoised `session.restore()` (`GET /auth/me`), sends
      signed-out visitors to `/login?next=…`, bounces signed-in ones away from it, and
      refuses `//…` as a next target. The UI reads `store.canWrite` / `store.myRole`: the
      memory form, the add-person and add-relation controls and the role line in the tree
      header are drawn only for a CONTRIBUTOR/OWNER, and a VIEWER cannot reach a write
      screen by typing the URL — the API answers 403 and the view shows the server's sentence
- [x] Security checklist from week 9 run on your app; findings fixed or listed
      — **`docs/security.md`**: fixed = hashing, enumeration-safe login, `HttpOnly` +
      `SameSite=Strict` cookie, Origin check, no raw SQL, no `v-html`, whitelist validation,
      full access-control matrix, secrets out of Git, fixed 500 message, **rate limiting**
      (10 failed sign-ins a minute on `login`, 10 registrations a minute, a 600/minute
      backstop on every route), **server-side logout revocation** (`User.sessionRevokedAt`
      read by `AuthGuard`, compared against a millisecond `iatMs` so signing straight back in
      still works), **helmet on the API + a CSP on the document in nginx**, and **0
      `npm audit` advisories** (three `overrides`, prod and dev). Listed = no lockout or
      password policy, the compose placeholder for `JWT_SECRET`, Swagger open in every
      environment, no `Secure` on localhost, rate-limit counters that live in one process —
      each with why it is acceptable now and what closes it
- [ ] 3-minute demo in the practice session
      — the only item that is not a file: it is given live. The walkthrough below is the
      script it follows, and every step in it was rehearsed against the running app

> **Explain: Where is the token stored in the browser, and what attack does that choice
> protect against or expose?**

**It is not stored *by the browser's script* at all. It is an `httpOnly` cookie named
`puong_session` — `HttpOnly`, `SameSite=Strict`, `Path=/`, 7 days, `Secure` behind TLS — and
it never appears in a response body: `POST /auth/login` answers with the account object and
nothing else. The SPA's own state is only `currentUser` in `useSessionStore`.**

Three things follow from that, and each is a different attack.

**1. XSS cannot exfiltrate it (the property being bought).** The classic token design puts
the JWT in `localStorage` or a JS variable so the client can attach it as an
`Authorization` header. That is readable by *any script running on the page*: one injected
`<img onerror>` in a biography, one compromised dependency, and the attacker reads
`localStorage.token` and sends it to their own server, where it keeps working for the rest
of its lifetime — on their machine, from any origin. With an `httpOnly` cookie,
`document.cookie` does not contain it, there is no header for script to build, and there is
no token in any JSON to grep for. An injected script can make the browser *act* as you, but
it cannot walk away with a credential that outlives the page.

**2. `SameSite=Strict` plus the server's `Origin`/`Host` check is what covers the attack
this choice *exposes*.** A cookie is attached by the browser automatically, which is
exactly why cookies brought CSRF back after headers solved it: a form on
`evil.example` that POSTs to `/api/trees/t1/memories` would carry the session with it if
anything allowed the request. `SameSite=Strict` stops it on modern browsers, and it is not
left alone there — the API compares `Origin` with `Host` on every unsafe method and answers
**403** if they disagree, which is checked by an e2e test and by
`curl -H 'origin: http://evil.example'`. So the exposure is real in principle (a client
that ignores `SameSite`) and closed by a second, server-side rule rather than by trusting
the browser.

**3. What is given up — and what no longer is.** Two costs remain, both listed in
`docs/security.md`:

- **It travels with every same-origin request**, including any future endpoint that does
  not need it — a cookie has no per-route opt-in the way an `Authorization` header does.
  The global `AuthGuard` is the compensating control.
- **It is a bearer credential for the whole origin**, so XSS is still a real problem, just
  a *bounded* one: the attacker gets the session's power for the duration of the page, not
  a copy of the key. That is the honest boundary of this choice — it protects against
  exfiltration and CSRF, it does not protect against an attacker who is already executing
  script in your origin.

**Revocation was the third cost, and it is closed rather than argued away.** A signed JWT
cannot be un-signed, so `POST /auth/logout` stamps `User.sessionRevokedAt` and `AuthGuard`
refuses every token issued at or before that instant: the copy somebody kept becomes a
**401** with its cookie cleared, while a sign-in *after* the stamp works normally. The
comparison runs on an `iatMs` claim written at sign-in because JWT's own `iat` counts whole
seconds — with seconds, a sign-out at `.900` and a re-login in the same second are the same
number, and it would be the honest user's brand-new session that stayed dead for seven
days. Both halves are tested: e2e asserts the revoked cookie is refused and that a fresh
login after it works.

The design question behind it is therefore not "cookie or `localStorage`" but *what do you
want an XSS bug to cost you*. Here the answer is: the tab it runs in, not the account for
the next seven days.

### 3-minute demo script

1. **Registration** (30 s) — `/login` → *Create an account*, new address, land on an empty
   home screen with **Add a family**; create one; you are its OWNER.
2. **The real API** (30 s) — network panel: `POST /api/auth/register` → 201, `Set-Cookie:
   HttpOnly; SameSite=Strict`, and a response body with no token in it.
3. **Roles** (40 s) — sign in as `viewer@puong.dev`: no add-person, no memory form, and
   `viewer@puong.dev` typing the memory-form URL directly gets the API's 403 sentence.
   Sign in as `contributor@puong.dev`: writes work; edit somebody else's memory → 403.
4. **Ownership** (30 s) — `owner@puong.dev` invites, demotes and removes; the last owner
   cannot deactivate themselves (409).
5. **Route guard** (20 s) — sign out on a deep link → `/login?next=…`, sign back in →
   returned to where you were.
6. **Security checklist** (30 s) — `docs/security.md` on screen: the fixed table (11 failed
   sign-ins → `429` with `Retry-After`, a logged-out cookie → `401`, `npm audit` → 0), then
   the listed table and what closes each of the five rows.

---

## M4 Feature complete (week 12)

- [x] Every MVP user story works end to end
- [x] Stretch feature implemented
- [x] Unit tests for core services; e2e tests for the main endpoints; all green
- [x] Swagger documentation available

**Evidence.** Nine MVP stories walked in a browser by
`e2e/tests/stories.spec.ts` — **10 passed, 1 skipped** (story 8, cut from the
MVP and declared as a skipped test rather than omitted) — producing the 28
screenshots `docs/stories-m4.md` maps story → commit → test → picture. The
stretch feature (search, filter, 10 per page) is story 9 in that run. The API
gates: `npm test` **54**, `npm run test:e2e` **61**, `npm run check` **259**,
`lint`/`typecheck`/`build` clean; `web`: `lint`, `typecheck`, `check` **36**,
`build`. Swagger is at `/api/docs` with 25 paths, and one of the eleven browser
tests asserts that document exists and contains the M4 routes.

**Demo:** `docs/demo-m4.md` — nine steps, 9 min 45 s, each step naming the
feature it shows, ending on Swagger and the three test gates.

> **Explain: Pick one test. What bug would it catch?**
>
> **The test:** `e2e/tests/stories.spec.ts` → *story 10 — nominate a
> successor, accept, and the ownership moves*. It signs in as the owner,
> nominates the contributor, signs out, signs in **as the contributor**, and
> then asserts two things in order: the URL is still `/` (home) and the
> heading *You have been named a successor* is on the screen — before it
> accepts and checks that the tree's settings now read *Ownership moved from
> … to …* with a date.
>
> **The bug it catches:** the nominee being carried past the one screen that
> can answer them. `/` has a shortcut — a member with exactly one tree is
> taken straight into it — and M4 added a reason to *stay* on home: an
> invitation or a nomination is waiting there. The inbox that decides this is
> fetched by two callers at almost the same moment, the route guard and the
> view it is about to render. If the view's call finds the state still
> `loading`, skips its own fetch, and reads an empty list as *"nothing
> pending"*, the guard redirects — the nomination sits in the database, the
> banner is never drawn, and the feature looks finished in every unit test
> that only checks `GET /api/successorships` returns the row. That is not a
> hypothetical: it is the failure this test found while it was being written,
> and the reason `stores/inbox.ts` now holds the in-flight promise so the
> second caller waits for the first's answer instead of answering itself.
>
> It also catches the two cheaper versions of the same bug: a stale inbox
> after an account switch (the previous member's list, or an empty one that
> never refetches), and a regression in the transaction behind *Accept
> ownership* — if `ownerId`, `previousOwnerId`, `ownershipTransferredAt` and
> the demotion of the old owner ever stop being written together, the last
> assertion (`Ownership moved from …`) fails with the tree in a half-changed
> state.
>
> In one sentence: **it asserts what the member sees at the moment the answer
> matters, so a race between two fetches cannot hide a feature that works on
> paper.**

---

## M5 Deployed (week 14)

- [ ] Dockerfiles for frontend and backend; `docker-compose.yml` for the whole stack
- [ ] Running on the school server with HTTPS, or starting locally with one `docker compose up`
- [ ] GitHub Actions workflow runs lint, tests and build on every push
- [ ] README complete (Appendix B); no secrets in the repository

> **Explain: What happens, step by step, between `git push` and your change being live?**

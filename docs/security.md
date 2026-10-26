# Week 9 security checklist, run on Puong

The checklist the week 9 lecture hands out, worked through against this
application rather than against a checklist: what was found, what was fixed,
and what is recorded as a known gap. Every "fixed" row points at the code or
the test that makes it checkable rather than at an intention.

Verification referenced below:

| Command | What it runs |
|---|---|
| `cd api && npm run check` | `scripts/check-api.cjs` — 184 assertions against a running, seeded API |
| `cd api && npm run test:e2e` | Supertest suite — 9 tests, including the session/cookie suite |
| `cd api && npm run lint && npm run typecheck && npm run build` | static gate |
| `cd web && npm run lint && npm run typecheck && npm run check && npm run build` | static gate + 36 service-layer assertions over the HTTP client |

---

## Fixed

### Passwords are hashed, and never leave the server

bcrypt at cost 10 (`api/src/users/users.service.ts`), applied on registration
and on any password change. The read DTO has no `passwordHash` field, so a
digest cannot be serialised by accident; `check-api.cjs` asserts that
`POST /api/users` and `POST /auth/register` answers contain no such key.
The seed replaces the prototype's placeholder values with real hashes.

### Login does not reveal whether an account exists

`POST /api/auth/login` answers **401** with the identical sentence
(`Email or password is incorrect.`) for an unknown email and for a wrong
password. Asserted by the e2e suite, so it cannot drift into two branches.

### Session storage: `httpOnly` cookie, not readable by script

`puong_session` is set with `HttpOnly`, `SameSite=Strict`, `Path=/` and a
7-day lifetime, and **no token appears in any response body** — the login
answer is the account, nothing else. `check-api.cjs` asserts all four
attributes and the absence of a token in the body; the e2e suite re-asserts
them through Supertest. The SPA keeps only the user object
(`web/src/stores/session.ts`), so there is no JavaScript-readable credential
for an XSS bug to harvest.

### CSRF

Three independent layers, because one of them being wrong is not a decision
anybody should have to notice:

1. `SameSite=Strict` — a form or link navigated in from another site arrives
   without the cookie.
2. `Origin` vs `Host` on every unsafe method, in `AuthGuard` — a cross-site
   POST that *does* carry the cookie is refused with **403** before the
   handler runs. Verified by `curl` with `Origin: http://evil.example`, and
   by an e2e test.
3. The cookie carries no readable token and no `GET` has a side effect, so
   there is nothing to replay silently.

### SQL injection

Every query goes through Prisma's query builder. There is no `$queryRaw`,
`$executeRaw`, string-built `where` clause or `ORDER BY` from user input
anywhere in `api/src` (grep for it: no matches). Search input is passed as
parameters to a Prisma `contains` filter.

### XSS

No `v-html` anywhere in `web/src` (grep: no matches), and every user-authored
string — names, biographies, memory titles and bodies — is rendered through
Vue's `{{ }}` interpolation, which escapes. The only `innerHTML` in the
application is inside the dependency that renders the router view.

### Over-posting (mass assignment)

The global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted` and
`forbidUnknownValues`, so a field no DTO declares is a **400**, not a silent
drop. This is the mechanism behind removing the identity fields:

```text
POST /api/trees            {"name": "...", "ownerId": "u2"}  → 400 property ownerId should not exist
POST /api/trees/t1/memories {..., "authorId": "u2"}          → 400 property authorId should not exist
POST /api/trees/t1/people  {..., "createdById": "u2"}        → 400 property createdById should not exist
```

All three are asserted in `check-api.cjs`. Who wrote or owns a row is read
from the session, so there is no field left to claim even in principle.

### Broken access control / IDOR

- **Authentication** is a global `APP_GUARD`: a route is closed unless it is
  marked `@Public()`, and only `register`, `login` and `logout` are.
- **Roles** are checked per tree by `TreeRoleGuard` + `@RequireRole(...)`,
  with the ranking in one place (`access.service.ts`) so a guard cannot
  compare roles as strings and disagree with the matrix in `docs/design.md`.
- **Ownership** is checked against the loaded row in the service: an author
  edits their own memory (403 to anyone else, owner included), a person's
  `createdById` and a memory's `authorId` come from the session, and
  `PATCH /users/:id` is yourself only.
- **404 over 403** for things you were never meant to know exist: a tree you
  are not a member of, and another person's `PRIVATE` memory.

Every branch of that is asserted from the API side (184 assertions across
all six roles × every endpoint) and the browser side cannot get around it,
because the client sends no identity at all.

### Secrets

`.env` is gitignored; only `.env.example` (with placeholders) is tracked.
`JWT_SECRET` and `COOKIE_SECURE` come from the environment, and the API
**fails fast at boot** if `JWT_SECRET` is missing rather than signing with a
default.

### Information in errors

The 500 path is a fixed string; the full error is logged server-side only.
Prisma's own messages (column names on a unique violation) are mapped to a
409 with a human sentence, and nothing about the schema is echoed on an
unexpected failure.

---

## Listed — known, accepted for this milestone

These are recorded rather than fixed, with the reason each one is defensible
at week 9. None of them is a hole the checklist calls a must-fix for a class
demo; each one becomes work before M5.

| # | Finding | Why it is listed here | What closes it |
|---|---|---|---|
| 1 | **No rate limiting** on `/auth/login` or anywhere else — a password can be tried indefinitely. | No throttler is wired up, and adding one is a small, self-contained change that should not be rushed into a graded milestone the day before submission. | `@nestjs/throttler` on the auth routes (e.g. 5 attempts/minute per IP), plus an exponential backoff. |
| 2 | **No account lockout and no password policy** beyond a minimum length. | Same reason as 1; lockout is also an availability weapon (lock a victim out by design). | Lockout or CAPTCHA after N failures; a length + breach-password check on register. |
| 3 | **Logout does not revoke the token server-side.** The cookie is cleared and the JWT stays technically valid until it expires. | The JWT is only ever in an `httpOnly` cookie with `SameSite=Strict`, so "stolen" means a same-origin script or a physical machine — and the lifetime is 7 days. | A `jti`/`iat` denylist checked by the guard, or a short-lived access token plus a refresh token. |
| 4 | **`docker-compose.yml` ships a placeholder `JWT_SECRET` default.** The value is committed, but it is `replace-me-before-this-leaves-your-machine` — it is a *default*, not a secret. | The API refuses to start without a secret when the variable is absent, and the real value lives in a gitignored `.env`. Still: a default that happens to work is a default somebody will ship. | Fail the compose file without an explicit `JWT_SECRET` (`${JWT_SECRET:?set me}`) so a run cannot silently use the placeholder. |
| 5 | **`npm audit --omit=dev` reports 7 advisories (2 moderate, 5 high)** in `api/`. | Every one is transitive and none is reachable from a route this app exposes: `multer` (no file upload exists — `photoUrl` is a URL string), `deepmerge-ts`/`prisma` (needs Prisma 7, a major), `js-yaml` (needs `@nestjs/swagger` 12, a major). `web/` reports 0. | Take the major upgrades deliberately, or drop the unused multer dependency path. |
| 6 | **No `helmet`, no CSP, no security headers.** | The SPA is served by nginx and Vite with no third-party scripts, no inline `eval`, and no user-supplied HTML — so there is little for a CSP to defend against *yet*, and a strict CSP built without testing tends to break the app silently. | `@nestjs/helmet` on the API and a `Content-Security-Policy` on the nginx server block, tested against the demo flow. |
| 7 | **Swagger is exposed at `/api/docs` in every environment.** | It documents a contract that is already public and every mutating route still needs a session; hiding it is a one-line guard. | `@ApiBearerAuth`-style guard or an env flag that disables the document outside development. |
| 8 | **The cookie is not `Secure` on `http://localhost`.** | A `Secure` cookie is *dropped* by the browser on plain http, which would break every request in development. `COOKIE_SECURE` exists exactly so the two situations are a config apart, not a code change. | `COOKIE_SECURE=true` wherever the API is reached over TLS (M5). |

---

## Not applicable

- **File upload limits** — there is no upload. `photoUrl` is a validated URL
  string, so the multer advisories above have no route to fire on.
- **Session fixation** — the session value is issued by the server on login
  and is not derived from anything the client sends.
- **CORS misconfiguration** — one origin from the environment,
  `credentials: true`, never `origin: true`.

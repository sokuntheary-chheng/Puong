# Week 9 security checklist, run on Puong

The checklist the week 9 lecture hands out, worked through against this
application rather than against a checklist: what was found, what was fixed,
and what is recorded as a known gap. Every "fixed" row points at the code or
the test that makes it checkable rather than at an intention.

Verification referenced below:

| Command | What it runs |
|---|---|
| `cd api && npm run check` | `scripts/check-api.cjs` — 192 assertions against a running, seeded API (safe to re-run: three consecutive runs pass) |
| `cd api && npm run test:e2e` | Supertest suite — 13 tests: error contract, session/cookie, revocation, rate limiting |
| `cd api && npm run lint && npm run typecheck && npm run build` | static gate |
| `cd api && npm audit` | dependency advisories — **0 vulnerabilities**, prod and dev |
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
   by an e2e test. Behind nginx this depends on the proxy forwarding the host
   **with its port** (`proxy_set_header Host $http_host` in `web/nginx.conf`):
   nginx's `$host` drops the port, the browser's `Origin` keeps it, and a
   comparison that can never match turns every write in the deployed stack
   into a 403 — which is what the Docker verification of this milestone
   caught.
3. The cookie carries no readable token and no `GET` has a side effect, so
   there is nothing to replay silently.

### Rate limiting on the routes that create a session

Three limits, aimed differently on purpose:

| Route | Limit | Where |
|---|---|---|
| `POST /api/auth/register` | **10 requests/minute** per address, every request counted | `@Throttle` on the route (`auth.controller.ts`) |
| `POST /api/auth/login` | **10 failed sign-ins/minute** per address — a success never spends it | `LoginThrottle` (`auth/login-throttle.service.ts`) |
| everything else | **600 requests/minute** per address per route, a backstop rather than a policy | `ThrottlerModule` + `APP_GUARD ThrottlerGuard` (`app.module.ts`) |

Counting *failures* on login is the reason `LoginThrottle` exists instead of a
second decorator: a member signing in on a second device, or
`scripts/check-api.cjs` signing in as the whole demo family, is not an attack
and should not be charged against a dictionary-attack budget. An attacker
gains nothing from the distinction — they only ever get to try passwords that
fail. The check runs *before* `bcrypt.compare`, so a blocked address is not
handed CPU to burn and cannot use response time as an account-existence oracle.

The throttler guard is registered ahead of `AuthGuard`, so the limit is
counted before the session is read; `check-api.cjs` asserts `X-RateLimit-Limit`
and `X-RateLimit-Remaining` **on a 401**, which is only true if that ordering
holds. Counter keys include the route name, so ten failed sign-ins cannot eat
`GET /api/trees`'s budget.

The key is the caller's address. Behind nginx every request arrives from the
proxy, so `TRUST_PROXY=true` (set in `docker-compose.yml`, off by default in
`.env.example`) makes Express read `X-Forwarded-For` — which nginx sets on
`/api/`. Left off when the API is reachable directly, because that header is
then one the client writes for itself, and a limit whose key the caller picks
is no limit.

Evidence:

```text
$ for i in $(seq 1 11); do curl -o /dev/null -w "%{http_code}\n" -X POST .../api/auth/login; done
401 401 401 401 401 401 401 401 401 401 429
$ curl -i -X POST .../api/auth/login
HTTP/1.1 429 Too Many Requests
Retry-After: 60
{"statusCode":429,"message":["Too many requests. Wait a moment and try again."],"error":"Too Many Requests"}
# while login is blocked, the rest of the API is not:
GET /api/users → 401   GET /api/auth/me → 401   POST /api/auth/register → 201
```

The e2e suite asserts the same two facts (the eleventh attempt is a 429 in the
standard body; every other route still answers its normal status).

### Logout revokes the session server-side

The cookie being cleared only clears *this browser's* copy, so `logout` also
stamps `User.sessionRevokedAt`, and `AuthGuard` reads that column after the
signature verifies: any token issued at or before the stamp is refused with
**401** and its cookie is cleared, no matter how valid its signature is. A new
sign-in has a later timestamp, so it works — which the e2e suite proves by
logging straight back in after a logout.

Getting that comparison right needed a millisecond. JWT's `iat` counts whole
seconds, so a sign-out at `10:00:00.900` and a re-login at `10:00:00.950` land
on the same value, and one of two things must give: either an immediate re-login
is condemned to a session that stays dead for seven days, or a token issued in
that same second survives the sign-out. `issueToken` therefore writes an
`iatMs` claim and the guard compares that — the sign-out kills exactly the
tokens issued before it. A token with neither field is refused rather than
given the benefit of the doubt.

Evidence: e2e `Session (e2e)` (revoked cookie → 401 with the clearing header,
fresh login → 200) and `check-api.cjs` (`the token logout revoked is refused,
even though its signature still verifies` → 401, then `login after logout → a
new session that works` → 200).

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

Every branch of that is asserted from the API side (192 assertions across
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

### Security headers: helmet on the API, a CSP on the document

Two policies, because there are two things being defended, and they are kept
apart deliberately so that no response ever carries two:

- **API responses** (`helmet()` in `api/src/main.ts`): a CSP of
  `default-src 'self'` with `object-src 'none'` and `connect-src 'self'`,
  plus `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy:
  no-referrer`, `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy:
  same-origin`. The API answers JSON, so a policy allowing only its own origin
  costs nothing and closes the "could a value I reflect end up as script"
  question for every response. One directive is relaxed on purpose —
  `script-src` allows `'unsafe-inline'` on this origin so Swagger UI's own
  bootstrap runs; the contract it documents is public and every mutating route
  still needs a session.
- **The document and its assets** (`web/nginx.conf`, `location /`): a CSP with
  `script-src 'self'` (no inline script, no CDN, no `eval:`), `img-src 'self'
  data: https:` for `photoUrl`, `object-src 'none'`, `frame-ancestors 'none'`,
  plus `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` and
  `nosniff`. It lives inside `location /` rather than at `server` level so
  `/api/` responses keep exactly one policy — the API's.

Evidence: `check-api.cjs` asserts the CSP, `nosniff`, `X-Frame-Options` and
`Referrer-Policy` **on a 401** (a header set only on the happy path protects
nobody), and `X-RateLimit-*` on the same response. Swagger still works under
the policy: `/api/docs` answers 200 HTML and `/api/docs/json` answers 200 with
all 18 paths.

### Dependency advisories: 0

`api/package.json` pins the three transitive chains that produced the seven
advisories through `overrides` — the packages that *depended* on the vulnerable
versions are unchanged, so nothing was upgraded past its major:

```json
"overrides": {
  "multer": "^2.5.0",
  "deepmerge-ts": "^8.0.2",
  "@nestjs/swagger": { "js-yaml": "^5.5.0" }
}
```

`npm audit` reports **0 vulnerabilities** with and without dev dependencies
(`web/` reports 0 too). `npx prisma validate`, `npm run seed`, `npm run build`
and the full check suite all still pass with multer 2.5.0 and js-yaml 5.5.0
installed — the overrides were verified, not just written down.

---

## Listed — known, accepted for this milestone

These are recorded rather than fixed, with the reason each one is defensible
at week 9. None of them is a hole the checklist calls a must-fix for a class
demo; each one becomes work before M5. Rate limiting, session revocation,
helmet/CSP and the dependency advisories were in this table until they were
fixed above — the rows below are what actually remains.

| # | Finding | Why it is listed here | What closes it |
|---|---|---|---|
| 1 | **No account lockout and no password policy** beyond a minimum length. | The rate limiter takes the edge off guessing (10 failures/minute/address) without the availability risk of lockout, which is a weapon: lock a victim out by design. | Lockout or CAPTCHA after N failures; a length + breach-password check on register. |
| 2 | **`docker-compose.yml` ships a placeholder `JWT_SECRET` default.** The value is committed, but it is `replace-me-before-this-leaves-your-machine` — it is a *default*, not a secret. | The API refuses to start without a secret when the variable is absent, and the real value lives in a gitignored `.env`. Still: a default that happens to work is a default somebody will ship. | Fail the compose file without an explicit `JWT_SECRET` (`${JWT_SECRET:?set me}`) so a run cannot silently use the placeholder. |
| 3 | **Swagger is exposed at `/api/docs` in every environment.** | It documents a contract that is already public and every mutating route still needs a session; hiding it is a one-line guard. | `@ApiBearerAuth`-style guard or an env flag that disables the document outside development. |
| 4 | **The cookie is not `Secure` on `http://localhost`.** | A `Secure` cookie is *dropped* by the browser on plain http, which would break every request in development. `COOKIE_SECURE` exists exactly so the two situations are a config apart, not a code change. | `COOKIE_SECURE=true` wherever the API is reached over TLS (M5). |
| 5 | **Rate-limit counters are per process.** `LoginThrottle` is a `Map` and `@nestjs/throttler`'s default storage is in memory, so a restart resets them and a second replica would keep its own. | This stack runs one API instance behind one nginx, and the counters are correct for exactly that deployment. A shared store is infrastructure, not a patch. | `ThrottlerStorageRedis` (or equivalent) for the throttler and a shared store for the sign-in limiter, before scaling past one replica. |

---

## Not applicable

- **File upload limits** — there is no upload. `photoUrl` is a validated URL
  string, so the multer advisory had no route to fire on even before the
  `overrides` entry pinned it away.
- **Session fixation** — the session value is issued by the server on login
  and is not derived from anything the client sends.
- **CORS misconfiguration** — one origin from the environment,
  `credentials: true`, never `origin: true`.

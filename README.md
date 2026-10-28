# Puong

A private family-tree application: relatives sign in, see who they are related to,
follow the path between any two people, keep photographs and memories, and hand the
tree to a chosen successor when they are ready. Built for one family's own use — the
data stays behind a login, and every write is attributed to the person who made it.

**Live URL:** not published — it is meant for a private family, so there is no public
deployment. It runs anywhere with one `docker compose up` (below), and HTTPS is a
one-flag overlay. Releases are the Git tags `m0` … `m5`.

## Screenshots

All 28 PNGs in [`docs/screenshots/`](docs/screenshots/) are written by the browser
suite, not taken by hand — [`docs/stories-m4.md`](docs/stories-m4.md) maps every story
to its test, its screenshots and the commit that carries it.

| | |
|---|---|
| ![The tree](docs/screenshots/story-01-tree-in-the-list.png) | ![Generations](docs/screenshots/story-03-ancestor-and-descendant-path.png) |
| ![Adding a person](docs/screenshots/story-04-person-added.png) | ![A memory with a photograph](docs/screenshots/story-06-memory-saved.png) |

## Architecture

```
   browser
      │  one origin: everything is under /
      ▼
┌─────────────┐   /api/*    ┌──────────────┐   Prisma    ┌──────────────┐
│  web        │ ──────────► │  api         │ ──────────► │  PostgreSQL  │
│  Vue 3 SPA  │  nginx      │  NestJS      │             │  16          │
│  Vite build │  (proxies)  │  JWT cookie  │             │  named volume│
└─────────────┘             └──────────────┘             └──────────────┘
                                 │
                                 └─ uploads/ : photographs on a named volume
```

- **web** — Vue 3 + Vite + Pinia, built to static files and served by nginx. nginx
  proxies `/api` to the API so the page and the API share one origin: no CORS to
  configure, and the session cookie behaves the same everywhere. One copy of every
  rule lives in [`web/app.conf`](web/app.conf), included by both the plain-http and
  the HTTPS server so the CSP and the proxy cannot drift apart.
- **api** — NestJS + Prisma. Runs migrations on start, issues a signed
  `puong_session` cookie, and enforces the permission matrix in
  [`docs/design.md`](docs/design.md) §2.1 (`owner` / `contributor` / `viewer`).
- **db** — PostgreSQL 16 in a named volume, so `docker compose down` does not lose
  the family.

## Run it locally

### The whole stack — one command

```bash
docker compose up                 # db + api + web
docker compose run --rm seed      # load the demo family (once)
open http://localhost:8080
```

That is the default path: plain http on `localhost:8080`, with the API published on
`3000` and PostgreSQL on `5432` (override any of them in a root `.env` — see
[`.env.example`](.env.example)).

### Over HTTPS

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
open https://localhost:8443
```

The overlay switches nginx to a TLS server block, stamps `Secure` on the session
cookie, and redirects `http://localhost:8080` to https. On first start a self-signed
certificate is generated into `./certs/` (gitignored) — enough for localhost. For a
real deployment put `certs/tls.crt` and `certs/tls.key` there (or set `WEB_TLS_PORT=443`
and put the certificate the server owns in the same place), restart `web`, and nothing
else changes.

### Developing

```bash
cp api/.env.example api/.env      # DATABASE_URL, JWT_SECRET, …
npm ci --prefix api               # Prisma migrations, then seed:
npm run seed --prefix api         #   3 users, 2 trees, 23 people, …
npm run start:dev --prefix api    # API on http://localhost:3000

npm ci --prefix web
npm run dev --prefix web          # Vite on http://localhost:5173, proxying /api
```

Open <http://localhost:5173>. The seed replaces whatever is in the database with the
demo family, so it is a deliberate command rather than something a restart does.

## Environment variables

Every variable has a working default; the table is what you would change.

| Name | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the API | `postgresql://puong:puong_dev_password@127.0.0.1:5432/puong?schema=public` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credentials of the `db` service (and of the URL above inside the stack) | `puong` / `puong_dev_password` / `puong` |
| `POSTGRES_PORT` | Host port PostgreSQL is published on | `5432` |
| `PORT` | Port the API listens on | `3000` |
| `API_PORT` | Host port the API is published on | `3000` |
| `CORS_ORIGIN` | Origin allowed to call the API directly (through nginx it is same-origin) | `http://localhost:8080` |
| `JWT_SECRET` | Signs the session cookie — **change it** before this leaves your machine | `replace-me-before-this-leaves-your-machine` |
| `COOKIE_SECURE` | `Secure` attribute on the session cookie; true only behind TLS | `false` |
| `TRUST_PROXY` | Believe `X-Forwarded-For` (only when nginx is the only way in) | `true` |
| `UPLOAD_DIR` | Where photographs are written | `uploads` |
| `WEB_PORT` | Host port nginx serves the SPA on | `8080` |
| `WEB_TLS_PORT` | Host port for https, and the port http redirects to | `8443` |

`.env` is gitignored; [`api/.env.example`](api/.env.example) and
[`.env.example`](.env.example) are the committed copies with placeholders. There are
no secrets in this repository.

## Test accounts

Seeded by `docker compose run --rm seed` (or `npm run seed --prefix api`), all with
the same password:

| Role | Email | Password |
|---|---|---|
| Owner (full control, transfers ownership) | `owner@puong.dev` | `Passw0rd!` |
| Contributor (adds and edits people and memories) | `contributor@puong.dev` | `Passw0rd!` |
| Viewer (read-only) | `viewer@puong.dev` | `Passw0rd!` |

## API documentation

Swagger UI at **<http://localhost:8080/api/docs>**, with the OpenAPI document at
`/api/docs/json`. The contract — one row per endpoint, with who may call it, the body,
the success and the possible errors — is
[`docs/api.md`](docs/api.md); `npm run check --prefix api` verifies the running server
against it.

Errors are always `{ "statusCode": 400, "message": ["…"], "error": "Bad Request" }`.

## Tests

| What | Command | Needs |
|---|---|---|
| API lint, typecheck, build | `npm run lint --prefix api`, `npm run typecheck --prefix api`, `npm run build --prefix api` | — |
| API unit tests (Jest) | `npm test --prefix api` | — |
| API e2e tests (Jest + a real database) | `npm run test:e2e --prefix api` | PostgreSQL, `DATABASE_URL` set |
| API contract check | `npm run check --prefix api` | the API running on `:3000`, seeded |
| Web lint, typecheck, checks, build | `npm run lint --prefix web`, `npm run typecheck --prefix web`, `npm run check --prefix web`, `npm run build --prefix web` | — |
| Browser stories (Playwright) | `npm test` **in `e2e/`** | the stack up; `E2E_BASE_URL` to aim it elsewhere |

`e2e/` is deliberately not a dependency of `api` or `web`: neither service should carry
a browser to do its own job. `pretest` and `posttest` re-seed, so the stories always
start from the same family.

Against the containerised stack instead of the dev servers:

```bash
docker compose up -d --build
docker compose run --rm seed
E2E_BASE_URL=http://localhost:8080 E2E_API_URL=http://localhost:3000 npm test --prefix e2e
```

Result at the `m5` tag: **10 stories passed, 1 skipped** (story 8, cut from the MVP —
see `PROPOSAL.md` "MVP scope"), 54 API unit tests, 61 API e2e tests, 28 screenshots.

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull
request: API lint/typecheck/build/unit/e2e against a PostgreSQL service, the contract
check against the built server, web lint/typecheck/check/build, and — in Docker —
`docker compose up` followed by the whole browser suite against that container. A red
commit is visible before anyone pulls it.

## Repository layout

| Path | What it is |
|---|---|
| `api/` | NestJS API, Prisma schema and migrations, the seed |
| `web/` | Vue 3 SPA, the nginx configuration for both modes |
| `e2e/` | Playwright browser stories and the screenshots they write |
| `docs/` | SRS, API contract, design, security notes, stories, demo script |
| `wind/` | The course brief (reference for what each milestone requires) |
| `MILESTONES.md` | The graded checklist and "explain your design" answers |

# Puong API

The backend of **Puong**, a shared family archive: NestJS 11 + Prisma 6 +
PostgreSQL 16, one module per resource, Swagger on `/api/docs`.

The contract this service implements — every endpoint, its status codes and
the error body — is **[`docs/api.md`](../docs/api.md)**; the data model is
**[`docs/erd.md`](../docs/erd.md)**. This file is how to get it running.

## Run it

```bash
cp .env.example .env          # then point DATABASE_URL at your PostgreSQL
npm ci
npx prisma migrate dev        # create the tables
npm run seed                  # load web/src/mock/db.json (see below)
npm run start:dev             # http://localhost:3000/api
```

Swagger UI: <http://localhost:3000/api/docs> — the machine-readable document
is at `/api/docs/json`.

With Docker instead, from the repository root:

```bash
docker compose up --build
docker compose run --rm seed  # seeding is opt-in; it replaces the data
```

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Server with reload |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | ESLint + Prettier over `src`, `test`, `prisma` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Reload the demo family from `web/src/mock/db.json` |
| `npm run migrate` | Create/apply a migration (`migrate:deploy` for production) |
| `npm test` | Unit tests |
| `npm run test:e2e` | The error contract, through a real application |
| `npm run check` | 112 assertions over every endpoint — needs the server running |

## Layout

```
prisma/         schema.prisma, migrations, seed.ts
src/common/     the exception filter, shared DTO helpers, custom validators
src/prisma/     the one Prisma client, provided globally
src/<resource>/ controller.ts (HTTP) · service.ts (data) · dto/ · module.ts
scripts/        check-api.cjs — the endpoint verification run by `npm run check`
```

Two rules the layout enforces: **controllers never touch the database**, and
**every error body comes from one filter** (`src/common/api-exception.filter.ts`),
so no endpoint can invent its own error shape.

## Seed data

`npm run seed` reads `web/src/mock/db.json` — the exact family the M1
prototype rendered — so the database and the mock cannot drift apart. It
wipes and reloads the tables. Every account signs in with `Passw0rd!`
(hashed with bcrypt, cost 10; the mock's placeholder hash is replaced).

**Authentication is M3.** There is no login and no token yet, and every
endpoint is reachable by any caller; `POST /api/users` creates an account
and hashes its password, but nothing issues a session. See the
"Authentication is M3" section of `docs/api.md`.

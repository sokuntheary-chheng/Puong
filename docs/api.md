# Puong API contract

One row per endpoint, written before the code (Appendix B of `wind/wind.md`).
The live version of the same document is Swagger at **`http://localhost:3000/api/docs`**
(`​/api/docs/json` for the machine-readable document), generated from the DTOs —
if the two ever disagree, the DTOs are right and this file is stale.

Diagram of what the endpoints read and write: **[docs/erd.md](erd.md)**.

---

## How to read this table

| Column | Meaning |
|---|---|
| **Who can call** | What the API checks *today*. Every row is "any caller": **authentication, roles and ownership checks are M3** — see [Authentication](#authentication-is-m3) below. |
| **Request body** | The DTO that validates it. Anything not named in the DTO is rejected with a 400 rather than silently dropped. |
| **Success** | The status and the payload. `204` responses have an empty body. |
| **Errors** | Only the statuses this endpoint can produce beyond the ones every endpoint can produce (400 from the global pipe, 500 from an unexpected failure). |

Base URL in development: `http://localhost:3000` — every path below already
includes the `/api` prefix set by the application.

---

## Endpoints

### Users

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/users` | anyone | – | 200 `User[]` (no `passwordHash`, ever) | – |
| GET | `/api/users/:id` | anyone | – | 200 `User` | 404 |
| POST | `/api/users` | anyone | `{ email, displayName, password }` | 201 `User` | 400, 409 (email taken) |
| PATCH | `/api/users/:id` | anyone | `{ email?, displayName?, password? }` | 200 `User` | 400, 404, 409 |

There is deliberately **no `DELETE /api/users/:id`**: a person and a memory
outlive the account that wrote them, so deleting an account would have to
decide what happens to the family record it created. That decision belongs
with the ownership rules of M3.

### Trees

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees` | anyone | – | 200 `Tree[]` | – |
| GET | `/api/trees?memberId=:userId` | anyone | – | 200 `Tree[]` — only trees where that account is an **ACTIVE** member | – |
| POST | `/api/trees` | anyone | `{ name, description?, coverPhotoUrl?, ownerId }` | 201 `Tree` (plus its `OWNER` membership, in the same transaction) | 400, 404 (no such owner) |
| GET | `/api/trees/:id` | anyone | – | 200 `Tree` | 404 |
| PATCH | `/api/trees/:id` | anyone | `{ name?, description?, coverPhotoUrl?, successorId? }` | 200 `Tree` | 400, 404 (tree or successor) |
| DELETE | `/api/trees/:id` | anyone | – | 204 | 404 |

`ownerId` is not editable: ownership transfer is a membership change (story
10), not a field on the row.

### Memberships (roles, scoped per tree)

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/members` | anyone | – | 200 `Membership[]` (pending invitations included) | 404 (no such tree) |
| GET | `/api/trees/:treeId/members/:userId` | anyone | – | 200 `Membership` — 404 means *not a member at all*; the row may still be `INVITED` or `REVOKED` | 404 |
| POST | `/api/trees/:treeId/members` | anyone | `{ userId, role, status? }` | 201 `Membership` (defaults to `INVITED`) | 400, 404 (tree or account), 409 (already a member) |
| PATCH | `/api/memberships/:id` | anyone | `{ role?, status? }` | 200 `Membership` | 400, 404 |
| DELETE | `/api/memberships/:id` | anyone | – | 204 | 404 |

### People

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/people` | anyone | – | 200 `Person[]` (never paginated — the canvas draws the whole family) | 404 |
| GET | `/api/trees/:treeId/people/:personId` | anyone | – | 200 `Person` | 404 (missing, **or in another tree**) |
| POST | `/api/trees/:treeId/people` | anyone | `{ fullName, nickname?, gender?, birthDate?, deathDate?, isLiving?, photoUrl?, bio?, createdById }` | 201 `Person` | 400, 404 (tree or account) |
| PATCH | `/api/trees/:treeId/people/:personId` | anyone | any of the above except `createdById` | 200 `Person` | 400, 404 |
| DELETE | `/api/trees/:treeId/people/:personId` | anyone | – | 204 (relations and memories cascade) | 404 |

Validation worth knowing: `fullName` is required (FR-4.1); `birthDate` and
`deathDate` must be real `YYYY-MM-DD` dates — `2026-02-31` is a 400, not the
1st of March — and `deathDate` may not precede `birthDate` (story 4).

### Relations

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/relations` | anyone | – | 200 `Relation[]` | 404 |
| POST | `/api/trees/:treeId/relations` | anyone | `{ fromId, toId, type }` | 201 `Relation` | 400 (self-link, loop, unknown type), 404 (tree or a person outside it), 409 (same link twice) |
| DELETE | `/api/trees/:treeId/relations/:relationId` | anyone | – | 204 | 404 |

`PARENT` reads *`from` is the parent of `to`*; `SPOUSE`, `SIBLING` and
`FRIEND` are undirected pairs. `FRIEND` is stored but never drawn (FR-5.4).

A `PARENT` link that would make somebody their own ancestor is refused with a
400: the generation pass (`FR-8.1`) walks parent edges to place people in
bands, and a loop would make that walk never finish.

### Memories

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/memories?personId=&viewerId=` | anyone | – | 200 `Memory[]`, newest occurred date first, undated last (FR-6.7), `PRIVATE` ones only for `viewerId` (FR-6.6) | 404 |
| GET | `/api/trees/:treeId/memories/:memoryId?viewerId=` | anyone | – | 200 `Memory` | 404 (including a private memory seen by the wrong viewer) |
| POST | `/api/trees/:treeId/memories` | anyone | `{ personId, authorId, title, body, happenedAt?, photoUrl?, visibility }` | 201 `Memory` | 400, 404 (tree or person) |
| PATCH | `/api/trees/:treeId/memories/:memoryId` | anyone | `{ title?, body?, happenedAt?, photoUrl?, visibility? }` | 200 `Memory` | 400, 404 |
| DELETE | `/api/trees/:treeId/memories/:memoryId` | anyone | – | 204 | 404 |

`title` and `body` are required (FR-6.1). `happenedAt` is optional; an empty
string is accepted and stored as `null`, because a cleared date input is "no
date", not a date of `""`.

### Search (stretch feature)

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/search?q=&page=&pageSize=&kind=&viewerId=&visibility=` | anyone | – | 200 `Page<SearchResult>` `{ items, page, pageSize, total, totalPages }` | 400 (`page`/`pageSize` out of range), 404 (no such tree) |

- `q` is matched against names, nicknames, biographies, memory titles and
  memory bodies, **case- and accent-insensitively**: `theary` finds
  `Theary`, `sokun` finds `Sokunthéary`.
- `page` starts at 1 and `pageSize` defaults to 6 (the prototype's page
  size), capped at 50.
- `kind` restricts to `people` or `memories`; `visibility` narrows memories.
- FR-6.6 applies exactly as it does to listing: a `PRIVATE` memory is a hit
  only for its author, so search cannot be used to reach what the list hides.
- An empty `q` is not an error — it is no search, and returns an empty page.

---

## Error format

Every non-2xx response, from every endpoint, has exactly these three fields:

```json
{ "statusCode": 400, "message": ["birthDate must not be before deathDate."], "error": "Bad Request" }
```

- `message` is **always an array**, even when there is only one problem:
  the validation pipe may report several fields at once.
- The body is produced in one place — `src/common/api-exception.filter.ts` —
  so an endpoint cannot invent its own shape.
- A Prisma unique-constraint violation becomes a 409, a missing row a 404,
  a foreign-key violation a 400, and anything unrecognised a 500 whose
  message says nothing about the schema.

### Status codes

| Code | When |
|---|---|
| 200 | Read or update succeeded |
| 201 | Created — the new record is in the body |
| 204 | Deleted — the body is empty |
| 400 | Validation failed, or the request is well-formed but meaningless (self-link, empty `PATCH`, parent loop) |
| 404 | No such record — or none **in the tree named in the path** |
| 409 | The record already exists (unique constraint) |
| 500 | Unexpected failure; logged in full, reported as a fixed string |

---

## Conventions

- **Everything is under `/api`**, so one origin can serve the SPA and the API
  without a path clash; Swagger lives at `/api/docs`.
- **Identifiers are opaque strings** (`cuid()`), and every subordinate
  resource is addressed *through its tree* (`/trees/:treeId/...`). A tree id
  in the path is how the API knows which family a person or memory belongs
  to, and it is what M3's ownership checks will read.
- **Date-only fields are `YYYY-MM-DD` text** (`birthDate`, `deathDate`,
  `happenedAt`); timestamps (`createdAt`, `invitedAt`, `acceptedAt`) are
  ISO-8601 UTC. The reasons are in `api/prisma/schema.prisma`.
- **`PATCH` never erases what it was not given**: a field missing from the
  body keeps its value, an explicit `null` clears it, and a `PATCH` with no
  fields at all is a 400 rather than a silent no-op.
- **`DELETE` always answers 204** and always requires an `@HttpCode(204)`,
  because a `DELETE` returning 200 with an empty body is an accident waiting
  to happen.

---

## Authentication is M3

There is no `Authorization` header anywhere in this milestone, and no login
endpoint — `POST /api/users` creates an account and hashes its password, but
nothing issues a token yet. That is a deliberate scope line, not an oversight:

- **M2** is graded on the resource contract — URLs, methods, status codes,
  the error body, validation and Swagger. Those are the same with or without
  a session, and building them first means M3 adds one guard in front of
  handlers whose behaviour is already tested.
- **M3** adds registration and login, JWTs, guards for authentication, roles
  and ownership, and the Vue route guards. The `role` and `status` the guards
  read already exist in `Membership`, and `viewerId` — passed today as a
  query parameter so FR-6.6 can be demonstrated — becomes the session's user
  and stops being something a client may claim.

Until then, every row in the table above says "anyone", and a client can
address any tree. Treat the running API as a development server.

## Seed data

`npm run seed` in `api/` loads `web/src/mock/db.json` into PostgreSQL — the
same family the M1 prototype displayed — with every account's password
replaced by a bcrypt hash of **`Passw0rd!`**:

| Account | Password | Membership |
|---|---|---|
| `owner@puong.dev` | `Passw0rd!` | `t1` OWNER, `t2` OWNER |
| `contributor@puong.dev` | `Passw0rd!` | `t1` CONTRIBUTOR |
| `viewer@puong.dev` | `Passw0rd!` | `t1` VIEWER, `t2` INVITED |

`t2` ("Mangosteen family") is intentionally empty, so the empty state of
FR-8.4 can be seen against the API as well as against the mock.

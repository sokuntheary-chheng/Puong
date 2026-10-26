# Puong API contract

One row per endpoint, written before the code (Appendix B of `wind/wind.md`).
The live version of the same document is Swagger at **`http://localhost:3000/api/docs`**
(`/api/docs/json` for the machine-readable document), generated from the DTOs —
if the two ever disagree, the DTOs are right and this file is stale.

Diagram of what the endpoints read and write: **[docs/erd.md](erd.md)**.

---

## How to read this table

| Column | Meaning |
|---|---|
| **Who can call** | What the API checks *today*. Every row assumes a session first — see [Session](#session) — and then a role in the tree named in the path, or an ownership check on the row itself. |
| **Request body** | The DTO that validates it. Anything not named in the DTO is rejected with a 400 rather than silently dropped. |
| **Success** | The status and the payload. `204` responses have an empty body. |
| **Errors** | Only the statuses this endpoint can produce beyond the ones every endpoint can produce (400 from the global pipe, 401 when there is no session, 500 from an unexpected failure). |

Base URL in development: `http://localhost:3000` — every path below already
includes the `/api` prefix set by the application. In the browser the same
paths are reached through one origin: nginx in Docker, or the Vite proxy in
development, forwards `/api` to this server.

---

## Session

There is no `Authorization` header anywhere in this API, and no token in any
response body. Authentication is a cookie:

| | |
|---|---|
| Name | `puong_session` |
| Value | a signed JWT, `HttpOnly` and `SameSite=Strict`, `Path=/`, 7 days |
| Set by | `POST /api/auth/register`, `POST /api/auth/login` |
| Cleared by | `POST /api/auth/logout`, or an expired/invalid value |
| `Secure` | off on `http://localhost`, on behind TLS — `COOKIE_SECURE=true` |

`HttpOnly` means script cannot read it, `SameSite=Strict` means a navigated-in
link from another site arrives without it, and neither is a substitute for the
server's own check: on every unsafe method (POST/PATCH/DELETE) the API compares
the `Origin` header with the `Host` and refuses the request with a **403** if
they disagree, which is what makes a cross-site request that *does* carry the
cookie useless.

`AuthGuard` is global (`APP_GUARD`): a route is closed unless it is marked
`@Public()`, which only `register`, `login` and `logout` are. Adding a
controller without deciding whether it is public is a compile-time-visible
omission, not a silent hole.

### 401 vs 403 vs 404

| Status | Meaning | Example |
|---|---|---|
| **401** | No session, or the cookie is not valid any more. The body says to sign in again. | `GET /api/trees` with no cookie |
| **403** | You are *somebody*, and *somebody in this tree* — but not enough, or not the owner of that row. | a VIEWER posting a person; a contributor editing another author's memory; a cross-site POST |
| **404** | The record does not exist **or was never yours to know about**: not a member of that tree, or a `PRIVATE` memory written by somebody else. Answering 403 here would confirm the thing the URL was guessing at (FR-2.5, FR-6.6). | `GET /api/trees/t1` as a non-member |

### The identity fields that are gone

`viewerId`, `authorId`, `createdById` and `ownerId` used to be request fields —
each was an invitation to write as somebody else. They are gone from every DTO:

| Field | What decides it now |
|---|---|
| `viewerId` (queries) | the session — who may see a `PRIVATE` memory is not a parameter |
| `authorId` (memory write) | the session — provenance is read, never claimed |
| `createdById` (person write) | the session — FR-4.4's ownership half |
| `ownerId` (tree create) | the session — the creator is made `OWNER` in the same transaction |

Sending one anyway is a **400** (`forbidNonWhitelisted`), not a quiet ignore.

---

## Endpoints

### Auth

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | anyone — the session is how you get one | `{ email, displayName, password }` | 201 `{ user }` + `Set-Cookie` | 400, 409 (email taken) |
| POST | `/api/auth/login` | anyone | `{ email, password }` | 200 `{ user }` + `Set-Cookie` | 400, 401 |
| POST | `/api/auth/logout` | anyone (a missing cookie is not an error) | – | 204, cookie cleared | – |
| GET | `/api/auth/me` | the session | – | 200 `User` | 401 |

A failed login answers **401 with the same sentence whether the email exists
or the password was wrong** (`Email or password is incorrect.`), so the
endpoint cannot be used to enumerate accounts. Passwords are hashed with
bcrypt (cost 10) and never leave the server.

### Users

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/users` | any signed-in account | – | 200 `User[]` (no `passwordHash`, ever) | 401 |
| GET | `/api/users/:id` | any signed-in account | – | 200 `User` | 401, 404 |
| POST | `/api/users` | any signed-in account — creating a relative who has no account yet | `{ email, displayName, password }` | 201 `User` | 400, 401, 409 (email taken) |
| PATCH | `/api/users/:id` | **yourself only** | `{ email?, displayName?, password? }` | 200 `User` | 400, 401, 404, 409, 403 (somebody else's account) |

There is deliberately **no `DELETE /api/users/:id`**: a person and a memory
outlive the account that wrote them, so deleting an account would have to
decide what happens to the family record it created.

Self-service registration is `POST /auth/register`, which also issues the
session; `POST /users` exists for adding a relative and does not sign you in
as them.

### Trees

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees` | any signed-in account | – | 200 `Tree[]` — only trees the **session's account** is an ACTIVE member of | 401 |
| POST | `/api/trees` | any signed-in account (FR-2.1) | `{ name, description?, coverPhotoUrl? }` | 201 `Tree` plus an ACTIVE `OWNER` membership for the caller, in one transaction | 400, 401 |
| GET | `/api/trees/:id` | VIEWER or above | – | 200 `Tree` | 401, 404 (not a member) |
| PATCH | `/api/trees/:id` | OWNER | `{ name?, description?, coverPhotoUrl?, successorId? }` | 200 `Tree` | 400, 401, 404, 403 |
| DELETE | `/api/trees/:id` | OWNER | – | 204 | 401, 404, 403 |

There is no `?memberId=` any more: the list is the caller's list. The
parameter is not read, so `GET /api/trees?memberId=somebody-else` answers
with *your* trees rather than theirs. `ownerId` is not editable — ownership
transfer is a membership change (story 10), not a field on the row.

### Memberships (roles, scoped per tree)

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/members` | VIEWER or above | – | 200 `Membership[]` (pending invitations included) | 401, 404 (not a member) |
| GET | `/api/trees/:treeId/members/:userId` | VIEWER or above | – | 200 `Membership`; 404 means *not a member at all*, while a row may still be `INVITED` or `REVOKED` | 401, 404 |
| POST | `/api/trees/:treeId/members` | OWNER (FR-3.1) | `{ userId, role, status? }` | 201 `Membership` (defaults to `INVITED`) | 400, 401, 404 (tree or account), 403, 409 (already a member) |
| PATCH | `/api/memberships/:id` | OWNER of that tree — **or you, on your own row, `status` only** (accepting/declining an invitation, FR-3.5) | `{ role?, status? }` | 200 `Membership` | 400, 401, 404, 403 (somebody else's role; your own role), 409 (last ACTIVE OWNER) |
| DELETE | `/api/memberships/:id` | OWNER of that tree, or you removing yourself | – | 204 | 401, 404, 403, 409 (last ACTIVE OWNER) |

The **409** on both rows is one rule: a tree cannot be left with no ACTIVE
OWNER, because it could never be administered again through this API.

### People

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/people` | VIEWER or above | – | 200 `Person[]` (never paginated — the canvas draws the whole family) | 401, 404 (not a member) |
| GET | `/api/trees/:treeId/people/:personId` | VIEWER or above | – | 200 `Person` | 401, 404 (missing, **or in another tree**) |
| POST | `/api/trees/:treeId/people` | CONTRIBUTOR or above | `{ fullName, nickname?, gender?, birthDate?, deathDate?, isLiving?, photoUrl?, bio? }` | 201 `Person` — `createdById` is the session | 400, 401, 404, 403 |
| PATCH | `/api/trees/:treeId/people/:personId` | CONTRIBUTOR or above | any of the above | 200 `Person` | 400, 401, 404, 403 |
| DELETE | `/api/trees/:treeId/people/:personId` | CONTRIBUTOR or above | – | 204 (relations and memories cascade) | 401, 404, 403 |

Validation worth knowing: `fullName` is required (FR-4.1); `birthDate` and
`deathDate` must be real `YYYY-MM-DD` dates — `2026-02-31` is a 400, not the
1st of March — and `deathDate` may not precede `birthDate` (story 4).

### Relations

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/relations` | VIEWER or above | – | 200 `Relation[]` | 401, 404 |
| POST | `/api/trees/:treeId/relations` | CONTRIBUTOR or above | `{ fromId, toId, type }` | 201 `Relation` | 400 (self-link, loop, unknown type), 401, 404 (tree or a person outside it), 403, 409 (same link twice) |
| DELETE | `/api/trees/:treeId/relations/:relationId` | CONTRIBUTOR or above | – | 204 | 401, 404, 403 |

`PARENT` reads *`from` is the parent of `to`*; `SPOUSE`, `SIBLING` and
`FRIEND` are undirected pairs. `FRIEND` is stored but never drawn (FR-5.4).

A `PARENT` link that would make somebody their own ancestor is refused with a
400: the generation pass (FR-8.1) walks parent edges to place people in bands,
and a loop would make that walk never finish.

### Memories

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/memories?personId=` | VIEWER or above | – | 200 `Memory[]`, newest occurred date first, undated last (FR-6.7); a `PRIVATE` memory appears only for its author (FR-6.6), decided from the session — `?viewerId=` is not read, so it changes nothing | 401, 404 |
| GET | `/api/trees/:treeId/memories/:memoryId` | VIEWER or above, and the author if it is private | – | 200 `Memory` | 401, 404 (including a private memory seen by the wrong person) |
| POST | `/api/trees/:treeId/memories` | CONTRIBUTOR or above | `{ personId, title, body, happenedAt?, photoUrl?, visibility }` | 201 `Memory` — `authorId` is the session | 400, 401, 404, 403 |
| PATCH | `/api/trees/:treeId/memories/:memoryId` | **the author only, whatever their role** — an OWNER curates records, never another person's account of the past (design.md §2.2) | `{ title?, body?, happenedAt?, photoUrl?, visibility? }` | 200 `Memory` | 400, 401, 404 (someone else's *private* memory), 403 (someone else's shared memory, or a VIEWER) |
| DELETE | `/api/trees/:treeId/memories/:memoryId` | the author, or an OWNER deleting a shared memory (FR-6.8) | – | 204 | 401, 404, 403 |

`title` and `body` are required (FR-6.1). `happenedAt` is optional; an empty
string is accepted and stored as `null`, because a cleared date input is "no
date", not a date of `""`.

### Search (stretch feature)

| Method | Path | Who can call | Request body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/api/trees/:treeId/search?q=&page=&pageSize=&kind=&visibility=` | VIEWER or above | – | 200 `Page<SearchResult>` `{ items, page, pageSize, total, totalPages }` | 400 (`page`/`pageSize` out of range), 401, 404 (no such tree / not a member) |

- `q` is matched against names, nicknames, biographies, memory titles and
  memory bodies, **case- and accent-insensitively**: `theary` finds
  `Sokunthéary`.
- `page` starts at 1 and `pageSize` defaults to 6 (the prototype's page
  size), capped at 50.
- `kind` restricts to `people` or `memories`; `visibility` narrows memories.
- FR-6.6 applies exactly as it does to listing, and for the same reason: the
  author is the session, so search cannot be used to reach what the list
  hides. `?viewerId=` is not a parameter — it is a **400**, because the
  query DTO forbids a field it does not declare.
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
| 204 | Deleted, or logged out — the body is empty |
| 400 | Validation failed, or the request is well-formed but meaningless (self-link, empty `PATCH`, parent loop, an identity field the DTO does not have) |
| 401 | No session, or the cookie is no longer good |
| 403 | Wrong role, not the owner of that row, a cross-site unsafe request, or an edit to somebody else's shared record |
| 404 | No such record — **or none you are allowed to know about** |
| 409 | The record already exists, or the change would leave a tree with no ACTIVE OWNER |
| 500 | Unexpected failure; logged in full, reported as a fixed string |

---

## Conventions

- **Everything is under `/api`**, so one origin can serve the SPA and the API
  without a path clash; Swagger lives at `/api/docs`.
- **Identifiers are opaque strings** (`cuid()`), and every subordinate
  resource is addressed *through its tree* (`/trees/:treeId/...`). A tree id
  in the path is how the API knows which family a person or memory belongs
  to, and it is what the role guard reads.
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

## Verification

`npm run check` in `api/` runs `scripts/check-api.cjs` against a running,
seeded API: 184 assertions over the contract above — every status code in
each table, the role matrix, the ownership rules, the cookie's attributes,
and the fact that no identity field can be claimed from a request body. It
cleans up everything it creates, so it passes twice in a row against the same
database.

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
FR-8.4 can be seen against the API as well as against the mock — and
`viewer@puong.dev`'s `INVITED` row there is the FR-2.3 case: invited, not yet
accepted, so not a member.

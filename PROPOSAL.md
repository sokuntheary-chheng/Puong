# Puong

*A shared family archive — one place where a family keeps its people, its dates and its memories, and where every relative can add what only they know.*

> **Puong** (ពង្ស) — *to visit, to keep in touch.*

---

## Problem

Family history, photographs and contact details are scattered across private phone galleries, old hard drives and individual memories, so most of it is lost within a single generation. Families need one shared place where each relative can add the people, dates and stories they personally know, so the record survives and stays useful as the family grows.

---

## Users and roles

Roles are scoped **per tree**, not per account: a `Membership` record carries the role, so the same person can be the owner of their own family tree and only a viewer in a partner's tree.

- **Owner** — the family organiser. Creates the tree, decides who may contribute, curates the people and the relations, keeps profiles complete, and nominates a successor. Full control over their tree.
- **Contributor** — a relative (an aunt, a cousin, a grandchild). Adds new people, links them to relatives already in the tree, and uploads memories and photographs. May edit and remove **only their own** contributions.
- **Viewer** — a relative who wants to look but not touch (a grandparent, a distant branch). Can see the tree, the people and all shared memories, but cannot create, edit or delete anything.

---

## User stories

1. **As an Owner, I want to create a family tree and give it a name, so that we have one place for our family.**
   Accepted when: the name is required and between 2 and 120 characters; the creator is stored as the tree's owner with the `OWNER` role; the tree appears in the owner's list of trees.

2. **As an Owner, I want to invite someone by email and choose their role, so that the whole family can contribute.**
   Accepted when: an invitation is sent to an address that already has an account, with the chosen role; the invited person sees a pending invitation on their home page; after accepting, the tree appears in their list; an invitation that is not accepted within 7 days expires automatically.

3. **As any member, I want to see the whole tree organised by generation, so that I can understand how everyone is connected.**
   Accepted when: every person in the tree appears exactly once, in a column for their generation; parents appear above their children; clicking a person opens their page with their relations and memories; a tree with no people shows a clear empty state instead of a blank screen.

4. **As a Contributor, I want to add a person to the tree with their name and dates, so that the record grows.**
   Accepted when: only the full name is required; birth and death dates are optional but a death date before the birth date is rejected with a clear message; the new person immediately appears in the tree in the correct generation; a person added with only a name is marked as a profile that still needs details.

5. **As a Contributor, I want to link a new person to relatives who are already in the tree, so that I do not have to enter the same family twice.**
   Accepted when: a link can be created between two different people with a type of parent, spouse, friend or sibling; a link to oneself is rejected; a link that would make a person their own ancestor is rejected with a clear message and the tree is left unchanged; the same link cannot be created twice.

6. **As a Contributor, I want to attach a memory and a photograph to a person, so that the family's stories and pictures are kept together.**
   Accepted when: a title and a text are required; one optional photograph can be attached in JPEG, PNG or WebP format up to 5 MB, and other formats or larger files are rejected with a clear message; the memory appears on that person's page and in the tree's activity list; a memory marked private is visible only to its author.

7. **As a Contributor, I want to edit and delete only my own contributions, so that I can fix my mistakes without touching anyone else's.**
   Accepted when: edit and delete controls appear only on contributions I created; the API rejects an attempt to change or remove someone else's contribution with `403 Forbidden`; my own contributions can always be corrected.

8. **As an Owner, I want to see which profiles are still incomplete, so that the record gets finished over time.**
   Accepted when: the owner's home page shows the number of people whose profile still needs details; clicking that number opens a filtered list of exactly those people; a profile stops being counted as soon as it has a name, a birth date and a photograph or a biography.

9. **As any member, I want to search for a person and filter the list, so that I can find anyone quickly.**
   Accepted when: typing part of a name in the search box returns only matching people; the list can be filtered by relation type, by living or deceased, and by generation; results are shown 10 per page with working previous and next controls.

10. **As an Owner, I want to nominate a successor who can take over the tree, so that the archive outlives the person who started it.**
    Accepted when: the owner can nominate one active member as successor; the successor sees a pending request and can accept or decline it; on acceptance the ownership moves, the previous owner becomes a contributor, and the change is recorded with its date.

---

## MVP scope

### Must have

- Registration, login, logout, with passwords hashed (bcrypt)
- Tree management: create, rename, list my trees, delete a tree
- Invitations and the three roles (Owner, Contributor, Viewer) per tree
- People: create, view, update, archive; photo, dates, biography, "needs details" status
- Relations between people: parent, spouse, friend, sibling — with the check that prevents a person from becoming their own ancestor
- Memories: create, view, edit, delete; optional photograph; private or shared with the tree
- Tree view organised by generation
- Permissions enforced on the server (role + ownership) and reflected in the UI
- Search by name, filter by relation type / living status / generation, 10 per page
- Validation on the client and on the server, with a consistent error format
- Unit tests for the core rules, end-to-end tests for the main endpoints
- Docker Compose for the whole stack, plus a README with test accounts

### Nice to have

- **File upload** as a second stretch feature — photographs for people and for memories
- **Scheduled task** — a daily job that expires stale invitations and creates upcoming-birthday reminders for members
- Family tree visualisation with SVG connector lines and a highlighted ancestor/descendant path
- Private memories (kept in the must-have list because it is the cheapest way to express real privacy)
- Transferring ownership to a nominated successor (story 10)
- Exporting the tree as JSON or PDF

---

## Entities

Four domain entities (`Tree`, `Person`, `Relation`, `Memory`), one authentication entity (`User`) and one join entity (`Membership`) that carries the per-tree role.

| Entity       | Main attributes                                                                                                                                                           | Relations                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `User`       | id, email (unique), passwordHash, displayName, createdAt                                                                                                                  | owns many `Tree`s; holds many `Membership`s; authors many `Memory`s                                                       |
| `Tree`       | id, name, description, coverPhotoUrl, ownerId, successorId?, createdAt                                                                                                    | belongs to one `User` (owner); may point to a successor `User`; has many `Membership`s, `Person`s, `Relation`s, `Memory`s |
| `Membership` | id, treeId, userId, role (`OWNER`/`CONTRIBUTOR`/`VIEWER`), status (`INVITED`/`ACTIVE`/`REVOKED`), invitedAt, acceptedAt                                                   | joins `User` and `Tree`; unique per (tree, user) pair                                                                     |
| `Person`     | id, treeId, fullName, nickname?, gender?, birthDate?, deathDate?, isLiving, photoUrl?, bio, profileStatus (`PLACEHOLDER`/`INCOMPLETE`/`COMPLETE`), createdById, createdAt | belongs to one `Tree`; created by one `User`; is the source of many `Relation`s; has many `Memory`s                       |
| `Relation`   | id, treeId, fromId, toId, type (`PARENT`/`SPOUSE`/`FRIEND`/`SIBLING`)                                                                                                     | connects two `Person`s inside one `Tree`; unique per (fromId, toId, type)                                                 |
| `Memory`     | id, treeId, personId, authorId, title, body, happenedAt?, photoUrl?, visibility (`PRIVATE`/`TREE`), createdAt                                                             | attaches to one `Person`; is written by one `User`; is scoped to one `Tree`                                               |

### Why these relations

- **`Tree` → `Person` is one-to-many.** A person belongs to exactly one tree. A tree holds many people. There is no situation where one person must exist in two trees, so a foreign key on `Person` is enough and every tree query is a single indexed lookup.
- **`Person` → `Memory` is one-to-many.** A memory is about one specific person and cannot be shared between two people; a person accumulates many memories over the years.
- **`User` ↔ `Tree` is many-to-many, resolved through `Membership`.** A person belongs to their own family tree and to their partner's family tree, and the same tree has many members. The join table is not just a bridge — it also carries the `role` and the invitation `status`, so there is one single source of truth for "what may this user do in this tree", instead of a role on `User` that would only work for one tree.
- **`Person` ↔ `Person` is many-to-many through `Relation`.** One table with a `type` column covers parent, spouse, friend and sibling. Using a separate `fatherId`/`motherId` column on `Person` would halve the number of relations but would make spouse and friend impossible to model without extra tables, and it would push the "friend" case into a different, unrelated mechanism.

---

## Stretch feature

**Search, filter and pagination** (the first option in the stretch list).

What it does in this app: the people list of a tree can be searched by name, filtered by relation type, by living or deceased, and by generation, and is shown 10 results per page with previous/next controls. The search box lives in the tree header so it is reachable from every screen of the tree.

Why this one and not another:

- It is the feature the product most obviously needs — "find everyone together quickly" is the reason people open a family tree, so it belongs in the product rather than in the stretch list only in name.
- It is cheap and low-risk: one query builder in the service layer, one paginated DTO, one Vue component. No infrastructure, no external service, nothing that can break at deployment.
- It gives a real unit-test target (the query builder) and a real end-to-end test (page 1, page 2, filtered results), which counts towards the test requirements as well.

**Planned second stretch feature: file upload.** Photographs for people and memories, with type and size limits and local disk storage mounted as a Docker volume.

**Possible third stretch feature: scheduled task.** A daily job that expires invitations older than 7 days and creates birthday reminders for the members of each tree.

**Deliberately not planned: real-time updates.** Several people editing the tree at the same time means conflict handling, reconnection and authentication over a socket — a large amount of work for a feature that the demo does not need. If there is time left at the end, a cheap substitute is to poll a small activity endpoint every 30 seconds and show "3 new memories".

---

## Out of scope, and why

One story was cut from the MVP, and the reason matters more than the story itself.

**Cut: a general activity feed across the whole family** ("see what everyone did recently").

The tree already has a per-person memory list and a search that reaches any person directly, so the feed would show the same information in a second place. It would also need its own pagination, its own unread state and its own filter set — three more screens of work, for a view that the search and the person pages already cover. It was cut so that the search and the tree view could be finished properly, because those two are what people actually come to the app for. The feature is kept as a possible later addition: if a scheduled activity endpoint is built for the cheap real-time substitute, the feed becomes almost free.

Also out of scope, and why:

| Not planned                                | Reason                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Friend requests, blocking, user profiles   | A friend is only another relation type on a person's page. Adding requests and blocking turns the archive into a social network, which is a different product with a different set of problems. |
| Chat and messaging between members         | Needs real-time infrastructure and message state, and it is not what a family archive is for.                                                                                                   |
| Timeline view of the whole family          | A third layout of the same data. The tree view and the filtered list already cover the two ways people look for this information.                                                               |
| GEDCOM import/export                       | XML parsing is a project of its own. It is a nice addition later, but it would compete with the features that are actually being graded.                                                        |
| Map and geolocation                        | External map tiles, extra API keys and a deployment dependency for a feature of no real value here.                                                                                             |
| DNA or ancestry matching                   | Cannot be built meaningfully, and it is not the point of the product.                                                                                                                           |
| Password reset, email sending, OAuth login | Requires an email provider and external credentials. Invitations are therefore stored in the database and shown on the invited user's home page, and the README documents a seeded invitation.  |
| Dark mode, i18n, mobile app                | Cosmetic or platform work that does not advance any requirement.                                                                                                                                |

---

## Repository

https://github.com/sokuntheary-chheng/Puong

Structure:

```text
Puong/
  web/                  Vue 3 + Vite + TypeScript SPA
  api/                  NestJS API (with prisma/)
  docs/                 wireframes, ERD, API contract, screenshots
  docker-compose.yml
  .github/workflows/ci.yml
  PROPOSAL.md
  MILESTONES.md
  README.md
```

---

## Test accounts

Seeded by `prisma/seed.ts` and documented in the README.

| Role        | Email                   | Password    | Access                                                   |
| ----------- | ----------------------- | ----------- | -------------------------------------------------------- |
| Owner       | `owner@puong.dev`       | `Passw0rd!` | Owner of tree 1 (Nguyễn family) and tree 2 (Trần family) |
| Contributor | `contributor@puong.dev` | `Passw0rd!` | Contributor in tree 1, **not a member of tree 2**        |
| Viewer      | `viewer@puong.dev`      | `Passw0rd!` | Viewer in tree 1, invited (not yet accepted) in tree 2   |

The seed also creates a four-generation tree with about 22 people, shared and private memories, and a few people whose profiles are still incomplete, so that the tree view, the filters and the "needs details" count are all meaningful on a fresh `docker compose up`.

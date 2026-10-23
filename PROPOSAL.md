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
   Accepted when: only the full name is required; birth and death dates are optional but a death date before the birth date is rejected with a clear message; the new person immediately appears in the tree in the correct generation.

5. **As a Contributor, I want to link a new person to relatives who are already in the tree, so that I do not have to enter the same family twice.**
   Accepted when: a link can be created between two different people with a type of parent, spouse, friend or sibling; a link to oneself is rejected; a link that would make a person their own ancestor is rejected with a clear message and the tree is left unchanged; the same link cannot be created twice.

6. **As a Contributor, I want to attach a memory and a photograph to a person, so that the family's stories and pictures are kept together.**
   Accepted when: a title and a text are required; one optional photograph can be attached in JPEG, PNG or WebP format up to 5 MB, and other formats or larger files are rejected with a clear message; the memory appears on that person's page; a memory marked private is visible only to its author.

7. **As a Contributor, I want to edit and delete only my own contributions, so that I can fix my mistakes without touching anyone else's.**
   Accepted when: edit and delete controls appear only on contributions I created; the API rejects an attempt to change or remove someone else's contribution with `403 Forbidden`; my own contributions can always be corrected.

8. **As an Owner, I want to see which profiles are still incomplete, so that the record gets finished over time.** *(nice to have — not in the MVP, see "What was cut from the MVP" below)*
   Accepted when: the owner's home page shows the number of people whose profile still needs details; clicking that number opens a filtered list of exactly those people; a profile stops being counted as soon as it has a name, a birth date and a photograph or a biography.

9. **As any member, I want to search for a person and filter the list, so that I can find anyone quickly.**
   Accepted when: typing part of a name in the search box returns only matching people; the list can be filtered by relation type, by living or deceased, and by generation; results are shown 10 per page with working previous and next controls.

10. **As an Owner, I want to nominate a successor who can take over the tree, so that the archive outlives the person who started it.**
    Accepted when: the owner can nominate one active member as successor; the successor sees a pending request and can accept or decline it; on acceptance the ownership moves, the previous owner becomes a contributor, and the change is recorded with its date.

---

## MVP scope

**Must have: stories 1–7, 9 and 10. Nice to have: story 8.**

### Must have

- Registration, login, logout; passwords hashed with bcrypt; sessions carried by a signed JWT
- Trees: create, rename, list my trees, delete a tree
- People: create, view, update, delete; full name, birth and death dates, gender, nickname, biography
- Relations between people: parent, spouse, friend, sibling — with the check that prevents a person from becoming their own ancestor
- Memories: create, view, edit, delete; an occurred date; private or shared with the tree
- Photographs: uploaded for people and for memories, JPEG / PNG / WebP up to 5 MB, stored on a Docker volume
- Invitations and the three roles (Owner, Contributor, Viewer) per tree
- Permissions enforced on the server (role and ownership) and reflected in the interface
- Tree view organised by generation, with the ancestor and descendant path of a selected person highlighted
- Search by name, filter by relation type / living status / generation, 10 results per page
- Validation on the client and on the server, with a consistent error format
- Unit tests for the core rules and end-to-end tests for the main endpoints; Swagger documentation
- Docker Compose for the whole stack, a CI workflow, and a README with the test accounts

### Nice to have

- **Story 8** — an Owner's count of profiles still needing details, and a filter that shows only them. It is the only story outside the MVP; the nine others must all work end to end.
- **Written expiry of invitations** — invitations older than 7 days are already treated as expired when they are read; a job would write that state to the database.

### What was cut from the MVP, and why

Five things in the first draft of this proposal are not in the MVP.

| Cut | Why it was removed |
| --- | --- |
| **SVG connector lines** on the tree view | The generation-column layout already shows the structure. Connector lines that align correctly are a known time sink and no requirement asks for them. The ancestor and descendant path is kept: it is the part people actually use, and it costs a fraction of the work. |
| **"Archive" state for a person** | A second lifecycle for a person, on top of the relation rules. A person is either in the tree or deleted. |
| **Activity list on the tree** | A second view of data that the person page and the search already reach. It had hidden inside story 6's acceptance criteria as an unnamed screen. |
| **Birthday reminders** | A stretch of a stretch. Search, filter and pagination is the chosen stretch feature, and reminders would also force a seventh entity to store them. |
| **Export to JSON or PDF** | Not a requirement, and the tree view already is the readable form of the data. Exporting is therefore not planned in either format. |

**Story 8 was also moved out of the MVP**, for a more interesting reason than the others. Its profile status was originally a stored field on a person with three values (`PLACEHOLDER`, `INCOMPLETE`, `COMPLETE`) — a small state machine that had to be recomputed every time a person or a photograph was edited, plus a dashboard and a filtered screen to show the result. The status is now **derived** from the person's data instead of stored: it is complete when the person has a name, a birth date, and either a photograph or a biography. The feature therefore costs one badge and one filter instead of a screen, a state machine and a dashboard, and it cannot fall out of sync because there is nothing to keep in sync.

---

## Entities

Four domain entities (`Tree`, `Person`, `Relation`, `Memory`), one authentication entity (`User`) and one join entity (`Membership`) that carries the per-tree role.

| Entity       | Main attributes                                                                                                                                                           | Relations                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `User`       | id, email (unique), passwordHash, displayName, createdAt                                                                                                                  | owns many `Tree`s; holds many `Membership`s; authors many `Memory`s                                                       |
| `Tree`       | id, name, description, coverPhotoUrl, ownerId, successorId?, createdAt                                                                                                    | belongs to one `User` (owner); may point to a successor `User`; has many `Membership`s, `Person`s, `Relation`s, `Memory`s |
| `Membership` | id, treeId, userId, role (`OWNER`/`CONTRIBUTOR`/`VIEWER`), status (`INVITED`/`ACTIVE`/`REVOKED`), invitedAt, acceptedAt                                                   | joins `User` and `Tree`; unique per (tree, user) pair                                                                     |
| `Person`     | id, treeId, fullName, nickname?, gender?, birthDate?, deathDate?, isLiving, photoUrl?, bio, createdById, createdAt                                                         | belongs to one `Tree`; created by one `User`; is the source of many `Relation`s; has many `Memory`s                       |
| `Relation`   | id, treeId, fromId, toId, type (`PARENT`/`SPOUSE`/`FRIEND`/`SIBLING`)                                                                                                     | connects two `Person`s inside one `Tree`; unique per (fromId, toId, type)                                                 |
| `Memory`     | id, treeId, personId, authorId, title, body, happenedAt?, photoUrl?, visibility (`PRIVATE`/`TREE`), createdAt                                                             | attaches to one `Person`; is written by one `User`; is scoped to one `Tree`                                               |

A person's profile status is **derived, not stored**: a profile counts as complete when the person has a name, a birth date, and either a photograph or a biography. It is not a column, so editing a person can never leave a stale status behind.

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

**File upload is implemented, but it sits in the MVP rather than in the stretch list.** Photographs are the content of a family archive, not an optional extra: an app that records people with no pictures is a contact list. It is kept deliberately small — two endpoints, one upload component reused by both, and one Docker volume.

---

## Out of scope

| Not planned | Reason |
| --- | --- |
| Real-time collaborative editing, chat and messaging between members | Conflict handling, reconnection and socket authentication are a large amount of work for a feature the demo does not need, and it is not what a family archive is for. |
| Friend requests, blocking, member profiles | A friend is only another relation type on a person's page. Requests and blocking turn the archive into a social network, which is a different product with a different set of problems. |
| Timeline view of the family | A third layout of data that the tree view and the filtered list already cover. |
| GEDCOM import and export | XML parsing is a project of its own, and it would compete with the features that are actually being graded. |
| Email delivery and password reset | Requires a mail provider and external credentials. Invitations are therefore stored in the database and shown on the invited user's home page. |
| Map, DNA matching, dark mode, i18n, mobile app | External services and API keys, or cosmetic work that advances no requirement. |

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

The seed also creates a four-generation tree with about 22 people, shared and private memories, and a few people whose profiles are still incomplete, so that the tree view and the filters are meaningful on a fresh `docker compose up` and story 8, if it is built, has something to count.

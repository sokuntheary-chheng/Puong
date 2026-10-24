# Puong — design decisions taken before M1

| Field | Value |
|---|---|
| **Status** | Decisions required before the frontend prototype (M1, week 5) |
| **Date** | 24 October 2026 |
| **Author** | Chheng Sokuntheary · p20240044 |
| **Source** | `docs/SRS.md` §3.2 · `PROPOSAL.md` |

Three decisions have to exist before M1 starts, because the mock data, the wireframes
and the route table all depend on them. Each one names the requirement it changes or
completes.

---

## 1. Where a person with no parents is placed

### 1.1 The problem

Two requirements currently disagree:

> **FR-5.6** …breadth-first traversal of `PARENT` relations, starting from the people who
> have no parents… and **every unrelated person in generation 0.**
>
> **FR-8.1** …grouped into columns, one column per generation, showing each person exactly once.

A person who married into the family has no `PARENT` relation in the tree. FR-5.6 therefore
places them in generation 0, and FR-8.1 renders them in the oldest column, beside their own
great-grandparent. Every tree contains these people, and the seeded tree contains several.

### 1.2 The rule

1. `gen(p)` = breadth-first depth over `PARENT` relations, starting from the people who have
   no parents. Those start at `0`.
2. **Repeat until nothing changes:** a person who has **no** `PARENT` relation adopts the
   **highest** generation among the people they are connected to by `SPOUSE`, `SIBLING` or
   `FRIEND`.
3. A person with no `PARENT` relation and no connection to a placed person is generation `0`.

Two properties make this rule safe to implement as written:

- **It never lowers a generation.** Pass 1's result is authoritative for anyone who has
  parents; pass 2 only raises people who have none.
- **It terminates.** Generations only rise and are bounded by the depth of the lineage, so
  the repeat loop converges — in at most two passes on the seeded data.

*Why the highest and not the lowest:* a person married to someone in generation 2 who is also
a friend of the founder must not appear above their own spouse.

### 1.3 Pseudocode

```text
function computeGenerations(people, relations):
    parentEdges = relations where type == PARENT
    children    = group parentEdges by fromId

    # pass 1 — breadth-first over parent edges
    for p in people with no parentEdges: gen[p] = 0
    queue = people with no parentEdges
    while queue not empty:
        p = pop(queue)
        for c in children[p] where gen[c] is undefined:
            gen[c] = gen[p] + 1
            queue.push(c)

    # pass 2 — adopt, until stable
    changed = true
    while changed:
        changed = false
        for p in people with no parentEdges:
            placed = [ gen[q] for q connected to p by SPOUSE | SIBLING | FRIEND
                       where gen[q] is defined ]
            if placed and max(placed) > gen[p]:
                gen[p] = max(placed)
                changed = true

    # pass 3 — defensive; unreachable while FR-5.4 rejects ancestor cycles
    for p where gen[p] is undefined: gen[p] = 0
    return gen
```

### 1.4 Worked examples

| Case | Generation | Why |
|---|---|---|
| Founder — no parents, no links | `0` | Oldest column. Correct. |
| In-law married to a generation-2 person, no parents recorded | `2` | Adopts the spouse's generation; sits beside their spouse. |
| Same person, also a friend of the generation-0 founder | `2` | Takes the **highest** of the two, so never above their spouse. |
| Anyone whose parents are recorded | BFS depth | Unaffected by pass 2. |
| Two parentless siblings, one married into a generation-2 branch | both `2` | Pass 2 repeats, so the sibling link carries it to the other. |
| A person created but not yet linked (story 4, before story 5) | `0` | Appears in column 1 and is flagged **not linked yet**, prompting the link. |

### 1.5 What this changes in the specification

- **FR-5.6** loses "every unrelated person in generation 0" and states the adoption rule.
- **Glossary rule 1 (Generation)** states the same rule in one line.

Nothing else in `docs/SRS.md` describes generation placement.

### 1.6 Tests to write at M2

These are the unit tests for `relations.service`:

1. A parentless spouse of a generation-2 person is generation 2.
2. A parentless person linked to generations 1 and 3 takes 3.
3. Two parentless siblings linked to each other and to a placed branch both take the branch.
4. A person with recorded parents keeps their BFS depth even when linked to a deeper person.
5. An unlinked person is generation 0.
6. The loop terminates on a chain of five parentless people attached at the far end.

---

## 2. Who may do what

### 2.1 The matrix

Role is scoped **per tree** (`Membership.role`), and ownership is decided by `createdById`
on a person and `authorId` on a memory. — FR-3.6, FR-4.4, FR-4.5, FR-6.4, FR-6.5

| Action | Owner | Contributor | Viewer | Requirement |
|---|---|---|---|---|
| Create a tree | ✓ | ✓ | ✓ | FR-2.1 |
| Rename or delete a tree | ✓ | — | — | FR-2.4 |
| Invite a member, change a role, remove a member | ✓ | — | — | FR-3.1, FR-3.5 |
| Nominate a successor | ✓ | — | — | FR-9.1 |
| Accept or decline a nomination | — | if nominated | — | FR-9.2 |
| Add a person | ✓ | ✓ | — | FR-4.1 |
| Edit or delete a person **they created** | ✓ | ✓ | — | FR-4.4, FR-4.5 |
| Edit or delete a person **someone else created** | ✓ | — | — | FR-4.4 |
| Upload a photograph on a person | ✓ | ✓ | — | FR-4.1, FR-6.2 |
| Add a relation | ✓ | ✓ | — | FR-5.1 |
| Delete a relation | ✓ | ✓ | — | FR-5.5 — see §2.3 |
| Add, edit or delete **their own** memory | ✓ | ✓ | — | FR-6.4 |
| Edit **someone else's** memory | — | — | — | nobody, ever — see §2.2 |
| Delete someone else's **shared** (`TREE`) memory | ✓ | — | — | needs FR-6.8 — see §2.2 |
| Delete someone else's **private** memory | — | — | — | author only, even for an Owner — FR-6.6 |
| View a shared memory | ✓ | ✓ | ✓ | FR-6.6 |
| View a private memory | author only | author only | — | FR-6.6 |
| Search, filter, paginate, browse the tree | ✓ | ✓ | ✓ | FR-7, FR-8 |
| Open a tree they are not a member of | — | — | — | `404` — FR-2.5 |
| Open a tree they were invited to but have not accepted | — | — | — | `404` — FR-2.3 |

### 2.2 Resolved: who may delete another member's memory

The specification was silent. FR-4.4 gives an Owner power over any *person*, but FR-6.4 and
FR-6.5 only ever discuss a contributor's *own* memories.

**Decision — three separate rules, for three different reasons:**

| | Edit | Delete |
|---|---|---|
| **Their own memory** | ✓ | ✓ |
| **Someone else's shared memory** | never | **Owner only** |
| **Someone else's private memory** | never | never |

- **Nobody edits another person's words.** A memory is one person's account of the past. An
  Owner may correct a *record* (a date on a person) but may not rewrite a *story*.
- **An Owner may delete a shared memory** — moderation is part of owning the tree, and it
  mirrors FR-4.4, where an Owner may delete any person.
- **Nobody touches a private memory, including an Owner.** FR-6.6 already says a private
  memory is shown to its author "including to an owner". You cannot moderate what you cannot
  see, so deletion follows visibility exactly.

*Why records and stories are treated differently:* a person's dates are facts the family
shares and the Owner curates; a memory is signed by its author. That distinction is the
reason the table above is not simply "Owner can do everything".

**Needs one new requirement** — `FR-6.8` — to put the second row into the specification.

### 2.3 Resolved: relations have no author

`Relation` is `id, treeId, fromId, toId, type` — there is no `createdById`, so an ownership
check on a relation is impossible by construction.

**Decision — this is deliberate, not an omission.** A relation describes the *tree's*
structure, not an individual's record: the link between two people is not owned by whoever
drew it first, and two contributors linking the same pair is prevented by the unique triple
(`fromId`, `toId`, `type`) rather than by ownership. Any member with write access may
therefore create or delete any relation in their tree.

The must-have requirement *"a user cannot edit or delete another user's data"* is carried by
**persons** (`createdById`) and **memories** (`authorId`), where the record genuinely belongs
to someone. Stating this out loud is what separates a deliberate design from an oversight.

**Needs a clarifying sentence on FR-5.5.**

### 2.4 Resolved: a pending invitation does not open a tree

FR-2.3 lists only *active* memberships, so a user who has been invited but has not accepted
receives `404` for that tree. That is correct: an invitation is a proposal, not access.

**Consequence for the interface:** the UI must never render a link to a tree whose
membership is not `ACTIVE`. Pending invitations appear on the home page instead (FR-3.2) and
the only action offered is accept or decline.

### 2.5 Still open — one cell

**Can a `VIEWER` be nominated as a successor?** FR-9.1 says "one active member", which
literally includes a Viewer, and FR-9.2 lets them accept — so a Viewer could be promoted
straight to Owner without ever having contributed.

- **Leave it** — "the eldest relative who only ever looks" is a plausible succession story.
- **Restrict it** — require the nomination to be an active `CONTRIBUTOR` or `OWNER`, so the
  successor has used the editing interface before they inherit it.

Not required for M1 either way; the wireframe for the succession screen does not depend on
it. Recommend **restricting it**, because FR-9.2 also demotes the previous owner to
`CONTRIBUTOR`, and a Viewer-turned-Owner has no experience of the role they are now
responsible for.

### 2.6 How this table is used later

| Milestone | Use |
|---|---|
| **M1** | Decides which buttons and forms render for the role the mock API returns — a Viewer's tree view has no *Add person* control. |
| **M2** | Becomes the `Who can call` column of the API contract (Appendix B), one row per endpoint. |
| **M3** | Becomes the guards on the API and the route guards in Vue. |
| **M4** | Becomes the `403 Forbidden` end-to-end tests. |

---

## 3. Routes

Six screens, six routes — two with a route parameter.

| Route | Screen | Route param | Component | M1 checklist item |
|---|---|---|---|---|
| `/login` | Login | — | `LoginView.vue` | — |
| `/` | Home — my trees | — | `HomeView.vue` | — |
| `/trees/:treeId` | Tree view | `treeId` | `TreeViewView.vue` | **detail page with a route parameter** |
| `/trees/:treeId/people/:personId` | Person page | `treeId`, `personId` | `PersonView.vue` | second route parameter |
| `/trees/:treeId/people/:personId/memories/new` | Memory form | `treeId`, `personId` | `MemoryFormView.vue` | **form with client-side validation** |
| `/trees/:treeId/search` | Search | `treeId` | `SearchView.vue` | — |

The M1 checklist requires **at least four routes including one detail page with a route
parameter**; six routes with two parameterised detail pages satisfies it with room to spare.

Two rules follow from this table:

- **Anything that must survive a refresh or be shareable as a URL belongs in the route.**
  The selected person on the tree view and the current search query are therefore route
  state (`?person=…`, `?q=…`), not store state.
- `/trees/:treeId/people/:personId/memories/new` is nested rather than `/memories/new`
  because a memory always belongs to a person, and the person must already be known before
  the form opens.

---

## 4. Out of scope for this document

The API contract (`docs/api.md`, M2), the ERD (`docs/erd.md`, M2), the seed script
(`prisma/seed.ts`, M2) and the README (M5) are separate deliverables and are not started
here. The generation rule in §1 becomes `relations.service` code and the tests in §1.6 at M2.

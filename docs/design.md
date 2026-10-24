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

1. **Initialise.** A person with no `PARENT` relation starts at `0`; anyone with parents is
   unplaced.
2. **Repeat until neither step changes anything:**
   - **(a) place** any unplaced person one generation below the **highest** of their parents;
   - **(b) raise** any person who has no `PARENT` relation to the highest generation among the
     people they are connected to by `SPOUSE`, `SIBLING` or `FRIEND`, when that is higher.
3. Anyone still unplaced is `0`.

Both steps only ever *raise* a generation, and generations are bounded by the depth of the
lineage, so the loop terminates. Alternating them matters: (b) can raise an in-law after (a)
has already placed her children, and those children must then be recomputed.

*Why step 2(a) takes the **highest** parent and not the shortest path:* a parentless in-law
is herself a root at generation 0. Breadth-first search would reach her children through her
at depth 1 and stop there, putting a grandchild in the same column as his own father. One
more than the *latest* parent gives the grandchild generation 2 — one below his father, whose
own mother's contribution of 1 is simply the smaller of the two.

*Why step 2(b) takes the **highest** connection:* a person married to someone in generation 2
who is also a friend of the founder must not appear above their own spouse.

### 1.3 Pseudocode

```text
function computeGenerations(people, relations):
    parentsByChild = PARENT relations grouped by toId
    linksByPerson  = SPOUSE | SIBLING | FRIEND relations grouped by either end

    for p in people:
        gen[p] = parentsByChild[p] ? undefined : 0      # step 1

    repeat:
        changed = false

        # step 2(a) — one below the LATEST parent, not the shortest path
        for p where gen[p] is undefined:
            ps = parentsByChild[p]
            if every q in ps has gen[q] defined:
                gen[p] = 1 + max(gen[q] for q in ps)
                changed = true

        # step 2(b) — a parentless person catches up with the people they are linked to
        for p with no PARENT relation:
            placed = [ gen[q] for q in linksByPerson[p] where gen[q] is defined ]
            if placed and max(placed) > gen[p]:
                gen[p] = max(placed)
                changed = true

    until changed == false

    for p where gen[p] is undefined: gen[p] = 0          # step 3, defensive
    return gen
```

Step 2(a) needs *every* parent placed before it fires, which is what makes it a loop rather
than a single pass: with two parentless parents the first iteration places neither child,
and the second places both.

### 1.4 Worked examples

| Case | Generation | Why |
|---|---|---|
| Founder — no parents, no links | `0` | Oldest column. Correct. |
| A child whose **father** has parents recorded and whose **mother** is a parentless in-law | `2` | The in-law is a root at `0`, so a shortest-path search would give `1` and place the child **beside their own father**. One more than the *latest* parent gives `2`. |
| In-law married to a generation-2 person, no parents recorded | `2` | Adopts the spouse's generation; sits beside their spouse. |
| Same person, also a friend of the generation-0 founder | `2` | Takes the **highest** of the two, so never above their spouse. |
| Anyone whose parents are recorded | one more than their latest parent | Unaffected by pass 2. |
| Two parentless siblings, one married into a generation-2 branch | both `2` | Pass 2 repeats, so the sibling link carries it to the other. |
| A person created but not yet linked (story 4, before story 5) | `0` | Appears in column 1 and is flagged **not linked yet**, prompting the link. |

### 1.5 What this changes in the specification

- **FR-5.6** loses "every unrelated person in generation 0", and replaces breadth-first depth
  with "one below the **highest** generation among their parents" — the shortest-path reading
  places a child of a parentless in-law beside their own father (see §1.2).
- **Glossary rule 1 (Generation)** states the same rule in one line.

Nothing else in `docs/SRS.md` describes generation placement.

### 1.6 Tests to write at M2

These are the unit tests for `relations.service`:

1. A parentless spouse of a generation-2 person is generation 2.
2. A parentless person linked to generations 1 and 3 takes 3.
3. Two parentless siblings linked to each other and to a placed branch both take the branch.
4. **A child with two parents, only one of whom has parents recorded, is one below the parent
   who does — never beside them.** This is the case a first-touch breadth-first search gets
   wrong, and the reason pass 1 takes the maximum.
5. A person with recorded parents keeps the generation derived from those parents even when
   linked to a deeper person.
6. An unlinked parentless person is generation 0.
7. The loop terminates on a chain of five parentless people attached at the far end.

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
| Nominate a successor | ✓ | — | — | FR-9.1 — the nominee must be an active `CONTRIBUTOR` or `OWNER` |
| Accept or decline a nomination | — | if nominated | — | FR-9.2 |
| Add a person | ✓ | ✓ | — | FR-4.1 |
| Edit or delete a person **they created** | ✓ | ✓ | — | FR-4.4, FR-4.5 |
| Edit or delete a person **someone else created** | ✓ | — | — | FR-4.4 |
| Upload a photograph on a person | ✓ | ✓ | — | FR-4.1, FR-6.2 |
| Add a relation | ✓ | ✓ | — | FR-5.1 |
| Delete a relation | ✓ | ✓ | — | FR-5.5 — see §2.3 |
| Add, edit or delete **their own** memory | ✓ | ✓ | — | FR-6.4 |
| Edit **someone else's** memory | — | — | — | nobody, ever — see §2.2 |
| Delete someone else's **shared** (`TREE`) memory | ✓ | — | — | FR-6.8 — see §2.2 |
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

**FR-6.8** now states this. It is the reason the second row of the matrix is not simply
"an Owner can do everything".

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

**FR-5.5 now states this**, so the asymmetry reads as a decision rather than an oversight.

### 2.4 Resolved: a pending invitation does not open a tree

FR-2.3 lists only *active* memberships, so a user who has been invited but has not accepted
receives `404` for that tree. That is correct: an invitation is a proposal, not access.

**Consequence for the interface:** the UI must never render a link to a tree whose
membership is not `ACTIVE`. Pending invitations appear on the home page instead (FR-3.2) and
the only action offered is accept or decline.

### 2.5 Resolved: who may be nominated as a successor

FR-9.1 said "one active member", which literally included a `VIEWER`: a Viewer could be
promoted straight to Owner without ever having used the interface, while FR-9.2 demotes the
previous owner to `CONTRIBUTOR`.

**Decision — restrict the nomination to an active `CONTRIBUTOR` or `OWNER`. FR-9.1 now says
so.** The successor takes over the role, and the previous owner is demoted *into*
`CONTRIBUTOR`, so the nominee should have held that role first.

The succession screen is unaffected: it is rendered from the member list either way, and it
is not part of M1.

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

## 4. Memory form validation

The client validates; the server does not trust it. These are the same rules
in both places, implemented once as pure functions in
`web/src/utils/memoryValidation.ts` and unit-tested there (NFR-3.1), so that
the two cannot drift.

| Field | Rule | Source |
|---|---|---|
| Title | Required; whitespace only does not count | FR-6.1 |
| Body | Required; whitespace only does not count | FR-6.1 |
| Occurred date | Optional; when present must be a real `YYYY-MM-DD` calendar date | FR-6.1 |
| Photograph | Optional; when present JPEG, PNG or WebP, at most 5 MB | FR-6.2 |
| Visibility | `TREE` (default) or `PRIVATE` | FR-6.6 |

**No length limit is imposed on the title or the body.** FR-2.2 sets one for
tree names and says nothing about memories; inventing one in the client would
make the client stricter than the specification, and inventing a different one
in the database would make the two disagree.

The date rule is written as a real-calendar check rather than a `Date`
round-trip because `new Date('2026-02-31')` does not throw — it silently
becomes 2 March. A pasted or scripted value must not survive as a different
date than the one written.

Three display rules follow from how the form behaves:

1. **Nothing is marked invalid until the field has been submitted or left.**
   Flagging a required title before the user has typed is the most common way
   a form feels like it is scolding, and it makes screen readers announce on
   focus.
2. **An error clears as soon as the value becomes acceptable**, not on the
   next submit — otherwise the form reports stale failures.
3. **Focus moves to the first field that is wrong** on a failed submit, and
   the count of problems is announced through `role="alert"`.

The MIME type checked in the browser is the file's *declared* type, which is
only a claim. M2 re-checks the magic bytes on upload, which is the check that
actually holds.

---

## 5. Out of scope for this document

The API contract (`docs/api.md`, M2), the ERD (`docs/erd.md`, M2), the seed script
(`prisma/seed.ts`, M2) and the README (M5) are separate deliverables and are not started
here. The generation rule in §1 becomes `relations.service` code and the tests in §1.6 at M2.

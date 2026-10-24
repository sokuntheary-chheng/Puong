# M1 — explain: what state lives in the store, and what stays in a component?

| Field | Value |
|---|---|
| **Milestone** | M1 — Frontend prototype (week 5) |
| **Question** | *What state lives in the store and what stays inside a component? Why?* |
| **Date** | 24 October 2026 |
| **Author** | Chheng Sokuntheary · p20240044 |

---

## The answer

**The store holds state that more than one screen needs, or that has to survive navigation.
A component holds state that only it uses and that should disappear when it unmounts.**

A third place exists — the **route** — for anything that must survive a refresh or be
shareable as a URL. Confusing the route with the store is the most common mistake here.

| State | Where | Why |
|---|---|---|
| Current user and session | **store** (`useAuthStore`) | Every screen needs it; it survives navigation and is restored from the token on reload. |
| The list of my trees | **store** (`useTreeStore`) | Shown on the home page and in the navigation on every other screen. |
| The active tree, its members and **my role in it** | **store** (`useTreeStore`) | The tree view, person page and search all need it, and every *can I do this* check reads it. |
| People of the active tree, normalised by id | **store** (`usePeopleStore`) | The same 22 people appear on the tree view, the person page and the search results. Fetching and holding them three times would give three copies that can disagree. |
| Login form: email, password, field errors | **component** | Belongs to the login form. If it lived in the store it would still be there after a successful login, and after logout. |
| Memory form: title, body, date, visibility, errors, "is this form dirty" | **component** | A draft for person A must not appear when the form is opened for person B. Component state is recreated on mount, so the bug cannot happen. |
| "Confirm delete" dialog open or closed | **component** | Pure presentation of one widget; nothing else cares. |
| Which tab is showing on the person page | **component** | Dies with the page, as it should. |
| Which person is hovered in the tree | **component** | Cosmetic and transient. |
| The selected person on the tree view (`?person=…`) | **route** | You must be able to refresh, use the back button and send someone a link to that person. In the store, a refresh would silently clear it. |
| The search query (`?q=…`) | **route** | Same reason — a search result page is useless if the link does not reproduce the search. |

## Why — the reasoning, not just the list

1. **Shared state must have one owner.** `people` is needed by three screens. One copy in
   the store means the tree view, the person page and the search results can never disagree
   about who is in the tree or what generation they are in. Three copies means they will.

2. **Component state is disposable, which is the point.** Anything placed in a component is
   destroyed on unmount. That is a *feature* for form drafts, validation errors and open
   dialogs: there is nothing to remember to reset, so there is no stale-state bug to write.

3. **Promoting local state to the store creates coupling for nothing.** Once a memory-form
   draft is in the store, every screen becomes indirectly aware of it, it shows up in the
   devtools as if it mattered, and someone must write the code that clears it. The store is
   not a junk drawer; state that has outlived its screen should be gone.

4. **The route is not the store.** Store state is lost on refresh; route state is not. The
   selected person and the search query both have to survive a refresh and be shareable, so
   they are route state. Reading `route.params.personId` instead of `store.selectedPersonId`
   is what makes the back button work.

### The rule of thumb

> If two different components would both want it, put it in the store.
> If it must survive a refresh or be a shareable link, put it in the route.
> If it would be meaningless after the component unmounts, keep it in the component.

## The concrete bug that justifies the split

If the memory form's draft lived in the store, this sequence would break:

1. Open *new memory* for person A, type half a story, navigate away without saving.
2. Open *new memory* for person B.

With the draft in the store, person B's form opens with **A's half-written story in it**.
Kept in the component, the form remounts empty — and no reset code was written, because none
was needed. That is the whole argument: the correct choice is also the one with less code.

## Store shape

One store per bounded context, not one large store:

```text
useAuthStore    → user, token, login(), logout()
useTreeStore    → trees, activeTree, members, myRole, fetchTrees(), selectTree()
usePeopleStore  → peopleById, peopleIds, generationOf(), fetchPeople(), addPerson()
```

A store is imported by the components that need it; components never reach into each other's
state, and no component owns a copy of data another screen also displays.

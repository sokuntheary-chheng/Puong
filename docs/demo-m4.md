# M4 demo — 10 minutes

Nine steps, each naming the feature it is showing. Total **9 min 45 s**, with
about 15 s of slack per step; if the clock runs over, step 8 loses its second
page and step 10 loses its Swagger half.

## Before the session (not part of the 10 minutes)

```bash
cd api  && npm run seed && node dist/src/main.js      # API + Swagger on :3000
cd web  && npm run dev                                # app on :5173
```

Open `http://localhost:5173` in a 1440×900 window with the network panel
visible. Keep a second browser profile signed out — steps 2, 6 and 9 switch
identity, and the point of each of those is *who is looking*.

The three accounts and their password (`Passw0rd!`) are on the README and in
`docs/SRS.md` §5.1: `owner@puong.dev`, `contributor@puong.dev`,
`viewer@puong.dev`.

---

## 1 · Sign in — *authentication and session* (0:00 → 0:40)

**Say:** the session is a cookie, not a token in JavaScript.

Open `/login` → *Create an account* with a fresh address, `Passw0rd!`. Land on
an empty **My trees**.

**Show:** the network panel on `POST /api/auth/register` — 201, `Set-Cookie:
HttpOnly; SameSite=Strict`, and a body with **no token in it**. Nothing was
written to `localStorage`.

## 2 · Create a tree and invite a relative — *trees + invitations* (0:40 → 1:50)

**Say:** one person starts the family, everybody else is invited into it.

**Add a family** → type `A` first → *at least 2 characters* (the browser's copy
of the API's rule, US-12) → name it **Demo Family** → it opens on its own empty
state (FR-8.4). Back to *My trees*, it is in the list.

Then, in the tree's own sidebar (owner only), **Invite a relative**:
`auntie@puong.dev` (register that account first, it takes 20 s), role
`CONTRIBUTOR`, **Send invitation**. Sign out, sign in as the auntie.

**Show:** her home page carries **Waiting for your answer** and *no* tree in
the list yet — an invitation is a question, not membership (FR-3.5).

## 3 · The tree by generation — *tree view* (1:50 → 3:00)

**Say:** this is what the API's 23 people look like in a browser.

Sign in as `viewer@puong.dev` — with one tree and nothing pending, the home
page shortcut takes you straight into **Mango family**. Four generation
columns, one card per person.

Click **Chheng Sokuntheary** → the panel reports *4 ancestors, 1 descendant*
and draws both paths (FR-8.3). Open their page: family, relations, memories.

**Show:** as the viewer there is no *Add a person* and no *Add a memory* — the
interface does not offer what the server would refuse (FR-3.6).

## 4 · Add a person — *people, with validation* (3:00 → 4:00)

Sign in as `contributor@puong.dev`, **Add a person** → submit it empty →
*A full name is required.*, said by the browser before any request (US-12).
Fill **Demo Person**, born `2000-05-04` → the card is on the canvas
immediately.

## 5 · Link relatives, and a loop that is refused — *relations* (4:00 → 5:00)

**Link relatives** → Demo Person, type `SIBLING`, pick the next person →
*Links recorded*.

Then the refusal: type `PARENT`, from **Chheng Sokuntheary** to **Mr. Mango**
→ *…would make them their own ancestor* — a **409**, because the body is fine
and the family is not (FR-5.4).

**Say:** a loop would also make the generation pass never finish, which is why
this one is a conflict and not a validation error.

## 6 · A memory with a photograph — *memories, uploads, privacy* (5:00 → 6:30)

Select **Demo Person** → **Add a memory** → title *The first mango harvest*,
body, date `2019-03-12`, visibility **Private**, choose a picture → *Saved*.

**Show:** `POST /api/uploads/photos` → 201 `{ url }` **then**
`POST /api/trees/t1/memories` — the file first, its URL in the body (FR-6.2).
The memory and its photo are on the person's page.

Switch to `viewer@puong.dev` and open the same person: the private memory is
simply not there (FR-6.6), and typing `/memories/new` sends them back to the
tree rather than rendering a form they may not use.

## 7 · Edit and delete only your own — *ownership of records* (6:30 → 7:30)

Back as the contributor: edit the person you just created → name becomes
**Demo Person (edited)**. Edit your own memory in place.

Then open **Mr. Mango**, created by somebody else: **no edit button** — and
(deep link) `PATCH` on him is a 403. Delete *your* person, confirm, the card is
gone.

**Say:** the button is a forecast of the server's answer; the 403 is the
answer.

## 8 · Search, filter, ten a page — *the stretch feature* (7:30 → 8:45)

`/trees/t1/search?q=theary` → 2 results. Then
`?relation=SPOUSE` → *16 results, page 1 of 2 · 10 per page*, exactly 10
cards, **Next** → *page 2 of 2*, 6 cards.

**Say:** the query lives in the address bar, so this filtered list is a link I
can send; the API caps `pageSize` at 50 and defaults to 10 (FR-7.3).

## 9 · Handing the tree over — *succession* (8:45 → 9:30)

As `owner@puong.dev`, open **Mango family** → sidebar → **Tree settings →
Successor** → pick `contributor@puong.dev` → **Nominate**.

Sign in as the contributor: home page, **You have been named a successor** —
one tree and still on home, because something is waiting (US-11) →
**Accept ownership**. Open the tree's settings:

**Show:** *Ownership moved from Sokuntheary Chheng to Sreypov Chheng on …* —
`ownerId`, `previousOwnerId` and `ownershipTransferredAt` written in one
transaction, and the former owner demoted to contributor (FR-9.2, FR-9.3).

## 10 · Swagger and the tests — *documentation and verification* (9:30 → 9:45)

`http://localhost:3000/api/docs` — 25 paths, cookie auth box at the top. Then
the terminal:

```bash
cd api  && npm test && npm run test:e2e && npm run check   # 54 · 61 · 259
cd web && npm run check                                     # 36
cd e2e && npm test                                          # 10 passed, 1 skipped
```

**Close on:** `docs/stories-m4.md` — story → commit → test → screenshot, and
the one skipped row, story 8, which was cut from the MVP on purpose.

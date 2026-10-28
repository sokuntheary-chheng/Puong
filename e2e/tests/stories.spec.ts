import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * The MVP walked end to end: stories 1–7, 9 and 10 of `PROPOSAL.md`, in the
 * order a person would tell them.
 *
 * What this file is for
 * ---------------------
 * The API's own suites prove that each endpoint obeys its rules; this proves
 * the thing the rubric actually asks for — that a *story* works end to end
 * through the interface a family member uses. Every test therefore starts
 * from `/login`, clicks the controls the page offers, and asserts on what
 * the screen says afterwards rather than on a response body.
 *
 * Two consequences of that choice, both deliberate:
 *
 *  - Each test gets a fresh browser context, so no test depends on a
 *    logout another one performed — except where switching identity *is*
 *    the story (an invitation has to be accepted by its invitee).
 *  - The run needs the demo data the API was seeded with, so `pretest`
 *    re-seeds and `posttest` re-seeds again to put the data back. The
 *    accounts, trees and people below are the seed's own.
 *
 * Story 8 is `test.fixme` — it was cut from the MVP (PROPOSAL, "MVP
 * scope"), so it is named here rather than quietly skipped, and the file
 * says in one line what it would have shown.
 *
 * Screenshots land in `docs/screenshots/`, which `docs/stories-m4.md`
 * maps back to stories, commits and tests.
 */

const SHOTS = fileURLToPath(new URL('../../docs/screenshots', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const PASSWORD = 'Passw0rd!';
const OWNER = 'owner@puong.dev';
const CONTRIBUTOR = 'contributor@puong.dev';
const VIEWER = 'viewer@puong.dev';
/** An account that does not exist in the seed — story 2 creates it. */
const NEW_RELATIVE = 'auntie@puong.dev';

const TREE = '/trees/t1';
const PERSON = 'M4 Demo Person';
const EDITED_PERSON = 'M4 Demo Person (edited)';

/**
 * Where the API answers *directly*. The Swagger check asks for the API's own
 * documents rather than a page, so against a containerised stack it has to
 * be `E2E_API_URL` (e.g. http://localhost:55300) instead of the dev server's
 * :3000 — the browser stories above never need it, they go through the page.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

/** A 1×1 PNG, so FR-6.2's format rule is met without shipping a fixture. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('form.auth button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * The header's own link home.
 *
 * The tree view carries a breadcrumb that says "My trees" too, so an
 * unscoped `getByRole('link', …)` matches both — the scope *is* the
 * assertion that the header is where the member navigates from.
 */
async function goHome(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'My trees' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'My trees' })).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/* ------------------------------------------------------------------ */
/* Story 1 — create a tree                                             */
/* ------------------------------------------------------------------ */

test('story 1 — create a family tree, find it in the list, delete it (FR-2.1–2.4)', async ({
  page,
}) => {
  await login(page, OWNER);
  await expect(page.getByRole('heading', { level: 1, name: 'My trees' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mango family/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add a family' }).click();

  /* FR-2.2 — refused by the browser-side copy of the rule before any
     request is made; the API enforces the same one (M3's checklist). */
  await page.locator('#tree-name').fill('A');
  await page.getByRole('button', { name: 'Create tree' }).click();
  await expect(page.locator('.create__error')).toContainText('at least 2 characters');
  await shot(page, 'story-01-name-too-short');

  await page.locator('#tree-name').fill('M4 Demo Family');
  await page.locator('#tree-description').fill('Made and removed by the M4 walkthrough.');
  await page.getByRole('button', { name: 'Create tree' }).click();

  await expect(page).toHaveURL(/\/trees\//);
  /* FR-8.4 — a tree with nobody in it says so instead of drawing nothing. */
  await expect(page.getByText('Nobody has been added to this tree yet')).toBeVisible();
  await shot(page, 'story-01-tree-created-empty');

  await goHome(page);
  await expect(page.getByRole('link', { name: /M4 Demo Family/ })).toBeVisible();
  await shot(page, 'story-01-tree-in-the-list');

  /* FR-2.4 — the owner deletes what they created, and the list is true
     again afterwards. */
  await page.getByRole('link', { name: /M4 Demo Family/ }).click();
  const deleteButton = page.getByRole('button', { name: 'Delete tree', exact: true });
  await expect(deleteButton).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await deleteButton.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: /M4 Demo Family/ })).toHaveCount(0);
  await shot(page, 'story-01-tree-deleted');
});

/* ------------------------------------------------------------------ */
/* Story 2 — invite by email                                           */
/* ------------------------------------------------------------------ */

test('story 2 — register an account, invite it by email, accept on the home page (FR-1.1, FR-3.1–3.3)', async ({
  page,
}) => {
  /* First the invitee, because an invitation to an address with no account
     is refused (FR-3.1) — there has to be somebody to invite. */
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#register-name').fill('Auntie Sreyneang');
  await page.locator('#login-email').fill(NEW_RELATIVE);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('form.auth button[type="submit"]').click();

  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { level: 1, name: 'My trees' })).toBeVisible();
  await expect(page.getByText('You have no trees yet')).toBeVisible();
  await shot(page, 'story-02-new-account-home');

  /* Then the owner, who does the inviting. */
  await logout(page);
  await login(page, OWNER);
  await page.goto(TREE);

  await page.locator('#invite-email').fill(NEW_RELATIVE);
  await page.locator('#invite-role').selectOption('CONTRIBUTOR');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('status')).toContainText('Invitation sent');
  await shot(page, 'story-02-invitation-sent');

  /* And back to the invitee, whose home page now has something on it
     (FR-3.2): the tree itself stays out of their list until they accept
     (FR-3.5). */
  await logout(page);
  await login(page, NEW_RELATIVE);

  await expect(page.getByRole('heading', { name: 'Waiting for your answer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mango family/ })).toHaveCount(0);
  await shot(page, 'story-02-invitation-on-home');

  await page.getByRole('button', { name: 'Accept' }).click();

  /* Accepted: the banner goes and the tree becomes reachable — which for a
     member with one tree means "/" takes them straight into it. */
  await expect(page.getByRole('heading', { name: 'Waiting for your answer' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/trees\/t1$/);
  await shot(page, 'story-02-invitation-accepted');
});

/* ------------------------------------------------------------------ */
/* Story 3 — the tree, by generation                                   */
/* ------------------------------------------------------------------ */

test('story 3 — generations, selection and the ancestor/descendant path (FR-8.1–8.3)', async ({
  page,
}) => {
  await login(page, VIEWER);

  /* A viewer with one tree and nothing pending is taken straight to it —
     the home page is a decision, and there is nothing to decide. */
  await expect(page).toHaveURL(/\/trees\/t1$/);
  await expect(page.locator('.card')).toHaveCount(23);
  await shot(page, 'story-03-tree-by-generation');

  /* FR-8.2 / FR-8.3 — selecting a person in the middle of the tree shows
     the path in both directions: four ancestors, one descendant. */
  await page.locator('.card', { hasText: 'Chheng Sokuntheary' }).first().click();
  await expect(page.locator('.panel__path')).toContainText(
    'Highlighted: 4 ancestors, 1 descendant',
  );
  await shot(page, 'story-03-ancestor-and-descendant-path');

  await page.getByRole('link', { name: /Open Chheng Sokuntheary's page/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Chheng Sokuntheary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /FAMILY|RELATIONS|MEMORIES/i })).toBeVisible();
  await shot(page, 'story-03-person-page');
});

/* ------------------------------------------------------------------ */
/* Story 4 — add a person                                              */
/* ------------------------------------------------------------------ */

test('story 4 — add a person with a name and a birth date (FR-4.1, FR-4.2)', async ({
  page,
}) => {
  await login(page, CONTRIBUTOR);
  await expect(page).toHaveURL(/\/trees\/t1$/);

  await page.getByRole('button', { name: 'Add a person', exact: true }).click();

  /* Only the name is required — and it is required: submitting empty is
     refused with the same sentence the API would return. */
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await expect(page.getByText('A full name is required.')).toBeVisible();
  await shot(page, 'story-04-name-required');

  await page.locator('#person-fullName').fill(PERSON);
  await page.locator('#person-birthDate').fill('2000-05-04');
  await page.getByRole('button', { name: 'Add person', exact: true }).click();

  /* The panel closes and the card is on the canvas — "immediately appears
     in the tree", which is what story 4 asks for. */
  await expect(page.locator('.pform')).toHaveCount(0);
  await expect(page.locator('.card', { hasText: PERSON })).toBeVisible();
  await shot(page, 'story-04-person-added');
});

/* ------------------------------------------------------------------ */
/* Story 5 — link relatives                                            */
/* ------------------------------------------------------------------ */

test('story 5 — link a person to relatives, and refuse a loop (FR-5.1, FR-5.4)', async ({
  page,
}) => {
  await login(page, CONTRIBUTOR);
  await expect(page).toHaveURL(/\/trees\/t1$/);

  await page.getByRole('button', { name: 'Link relatives' }).click();
  await expect(page.getByRole('heading', { name: 'Link a relative' })).toBeVisible();

  await page.locator('#rel-source').selectOption({ label: PERSON });
  await page.locator('#rel-type').selectOption('SIBLING');
  const target = await page.locator('#rel-target option').nth(1).getAttribute('value');
  await page.locator('#rel-target').selectOption(target as string);
  await page.getByRole('button', { name: 'Add link', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Links recorded' })).toBeVisible();
  await expect(page.locator('.links__item').first()).toContainText(PERSON);
  await shot(page, 'story-05-link-created');

  /* FR-5.4 — a parent link that would close the family into a loop is
     answered 409, and the panel shows the sentence rather than a code. */
  await page.locator('#rel-type').selectOption('PARENT');
  await page.locator('#rel-source').selectOption({ label: 'Chheng Sokuntheary' });
  await page.locator('#rel-target').selectOption({ label: 'Mr. Mango' });
  await page.getByRole('button', { name: 'Add link', exact: true }).click();

  await expect(page.locator('.rform__error')).toContainText(/ancestor|loop/i);
  await shot(page, 'story-05-cycle-refused');
});

/* ------------------------------------------------------------------ */
/* Story 6 — a memory with a photograph                                */
/* ------------------------------------------------------------------ */

test('story 6 — a memory with a photograph, and a private one kept private (FR-6.1, FR-6.2, FR-6.6)', async ({
  page,
}) => {
  await login(page, CONTRIBUTOR);
  await expect(page).toHaveURL(/\/trees\/t1$/);

  /* Select the person first: the header's "Add a memory" follows whoever
     is selected, so the memory cannot land on the wrong record. */
  await page.locator('.card', { hasText: PERSON }).first().click();
  await page.getByRole('link', { name: 'Add a memory' }).click();
  await expect(page).toHaveURL(/\/memories\/new$/);

  await page.locator('#memory-title').fill('The first mango harvest');
  await page.locator('#memory-body').fill(
    'We picked mangoes all afternoon and split the last one three ways.',
  );
  await page.locator('#memory-happenedAt').fill('2019-03-12');
  await page.locator('input[name="visibility"][value="PRIVATE"]').check();
  await page.locator('#memory-photo').setInputFiles({
    name: 'mango.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  });

  await page.getByRole('button', { name: 'Save memory' }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await shot(page, 'story-06-memory-saved');

  await page.getByRole('link', { name: "Back to this person's page" }).click();
  const personPath = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name: 'The first mango harvest' })).toBeVisible();
  await expect(page.locator('.memory__photo')).toBeVisible();
  await shot(page, 'story-06-memory-on-the-person');

  /* FR-6.6 — the same memory, seen by a member who did not write it: it is
     simply not there. And FR-3.6: that member is a viewer, so the form for
     writing one is not reachable either. */
  await logout(page);
  await login(page, VIEWER);

  await page.goto(personPath);
  await expect(page.getByRole('heading', { name: 'The first mango harvest' })).toHaveCount(0);
  await shot(page, 'story-06-private-invisible-to-a-viewer');

  await page.goto(`${personPath}/memories/new`);
  await expect(page).toHaveURL(/\/trees\/t1$/);
});

/* ------------------------------------------------------------------ */
/* Story 7 — edit and delete your own work                             */
/* ------------------------------------------------------------------ */

test('story 7 — edit and delete only your own contributions (FR-4.4, FR-4.6, FR-6.4)', async ({
  page,
}) => {
  await login(page, CONTRIBUTOR);
  await expect(page).toHaveURL(/\/trees\/t1$/);

  await page.locator('.card', { hasText: PERSON }).first().click();
  await page.getByRole('link', { name: `Open ${PERSON}'s page` }).click();

  /* The person the contributor created: editable. */
  await page.getByRole('button', { name: 'Edit this person' }).click();
  await page.locator('#person-fullName').fill(EDITED_PERSON);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: EDITED_PERSON })).toBeVisible();
  await shot(page, 'story-07-person-edited');

  /* …and their own memory: also editable, in place, without a new route. */
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const memoryTitle = page.locator('.medit input[type="text"]').first();
  await memoryTitle.fill('The first mango harvest (corrected)');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'The first mango harvest (corrected)' }),
  ).toBeVisible();
  await shot(page, 'story-07-memory-edited');

  /* Somebody else's person: the control is not offered at all — a button
     that only ever fails is worse than no button (FR-4.4, FR-7… the API
     refuses it anyway with 403). */
  await page.goto('/trees/t1/people/p01');
  await expect(page.getByRole('heading', { level: 1, name: 'Mr. Mango' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit this person' })).toHaveCount(0);
  await shot(page, 'story-07-others-contributions-untouched');

  /* And their own: deletable, with a confirmation that names the cost. */
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: EDITED_PERSON })).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('.writes__btn--danger').click();

  await expect(page).toHaveURL(/\/trees\/t1$/);
  await expect(page.locator('.card', { hasText: EDITED_PERSON })).toHaveCount(0);
  await shot(page, 'story-07-person-deleted');
});

/* ------------------------------------------------------------------ */
/* Story 8 — cut from the MVP                                          */
/* ------------------------------------------------------------------ */

test.skip(
  'story 8 — incomplete profiles on the owner’s home page (cut from the MVP — see PROPOSAL "MVP scope")',
  async () => {
    /* Declared rather than deleted: the story exists, the checklist should
       show it as *decided against* rather than as something forgotten, and
       this line is what `docs/stories-m4.md` points at. */
  },
);

/* ------------------------------------------------------------------ */
/* Story 9 — search and filter (the stretch feature)                   */
/* ------------------------------------------------------------------ */

test('story 9 — search, filter, and ten results a page (FR-7.1–7.3)', async ({ page }) => {
  await login(page, OWNER);

  /* The query lives in the URL, so this is a link a relative could be
     sent — which is the point of putting it there (design.md §3). */
  await page.goto(`${TREE}/search?q=theary`);
  await expect(page.locator('.count')).toContainText('2 results');
  await shot(page, 'story-09-search-by-query');

  await page.goto(`${TREE}/search?relation=SPOUSE`);
  await expect(page.locator('.count')).toContainText('16 results');
  await expect(page.locator('.count')).toContainText('page 1 of 2');
  await expect(page.locator('.count')).toContainText('10 per page');
  await expect(page.locator('.results li')).toHaveCount(10);
  await shot(page, 'story-09-search-filtered');

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.count')).toContainText('page 2 of 2');
  await expect(page.locator('.results li')).toHaveCount(6);
  await shot(page, 'story-09-search-page-two');
});

/* ------------------------------------------------------------------ */
/* Story 10 — the successor takes over                                 */
/* ------------------------------------------------------------------ */

test('story 10 — nominate a successor, accept, and the ownership moves (FR-9.1–9.3)', async ({
  page,
}) => {
  await login(page, OWNER);
  await page.goto(TREE);

  await expect(page.locator('#settings-nominee')).toBeVisible();
  await page.locator('#settings-nominee').selectOption('u2');
  await page.getByRole('button', { name: 'Nominate', exact: true }).click();
  await expect(page.getByText(/has been nominated on/)).toBeVisible();
  await shot(page, 'story-10-successor-nominated');

  /* The nominee: a member with exactly one tree, who would otherwise be
     carried straight into it by the home page's shortcut — the inbox is
     what keeps them on the screen that has something to say. */
  await logout(page);
  await login(page, CONTRIBUTOR);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'You have been named a successor' })).toBeVisible();
  await shot(page, 'story-10-nomination-banner');

  await page.getByRole('button', { name: 'Accept ownership' }).click();
  await expect(
    page.getByRole('heading', { name: 'You have been named a successor' }),
  ).toHaveCount(0);

  /* FR-9.3 — one transaction: the tree now names the new owner and records
     the day it moved. */
  await page.goto(TREE);
  await expect(page.locator('.card__transfer')).toContainText('Ownership moved from');
  await shot(page, 'story-10-ownership-transferred');
});

/* ------------------------------------------------------------------ */
/* Swagger — M4's "documentation available" checkbox                   */
/* ------------------------------------------------------------------ */

test('Swagger UI and the OpenAPI document are served by the API', async ({ request }) => {
  const ui = await request.get(`${API}/api/docs/`);
  expect(ui.ok()).toBe(true);

  const spec = await request.get(`${API}/api/docs/json`);
  expect(spec.ok()).toBe(true);
  const document = await spec.json();
  expect(Object.keys(document.paths).length).toBeGreaterThan(20);
  expect(document.paths['/api/trees/{id}/successor']).toBeDefined();
  expect(document.paths['/api/memberships/mine']).toBeDefined();
});

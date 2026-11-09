#!/usr/bin/env node
/**
 * Generates the M1 wireframes in docs/wireframes/*.svg.
 *
 * The rubric asks for wireframes of the main screens in docs/ — "(photo or
 * tool)". These are the "tool" route: low-fidelity sheets generated from the
 * six routes in design.md §3, so the drawings cannot drift from the route
 * table the way a hand-drawn sketch in a folder can. Nothing here is a
 * screenshot of the build; a wireframe shows structure and states, not the
 * finished pixels, and the graded M1 artefact is the structure.
 *
 * Regenerate with:  node docs/wireframes/build.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

const W = 960;
const FONT =
  'font-family="-apple-system, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif"';
const INK = '#46352f'; /* --text */
const MUTED = '#867972'; /* text mixed towards the canvas */
const RULE = '#e6d6c4'; /* --border */
const SURF = '#fffdf9'; /* --surface */
const ACCENT = '#b9634b'; /* --primary */
const DANGER = '#8d5140'; /* primary mixed towards the text */
const BARE = '#f7f1e8'; /* --canvas */

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const T = (x, y, t, o = {}) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${o.size ?? 13}" fill="${
    o.fill ?? INK
  }" font-weight="${o.weight ?? 400}"${
    o.italic ? ' font-style="italic"' : ''
  } text-anchor="${o.anchor ?? 'start'}">${esc(t)}</text>`;

const BOX = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 12}" fill="${
    o.fill ?? SURF
  }" stroke="${o.stroke ?? RULE}"${o.sw ? ` stroke-width="${o.sw}"` : ''}/>`;

const BAR = (x, y, w, h = 7) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${BARE}"/>`;

const LINE = (x1, y1, x2, y2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${RULE}"/>`;

/** A numbered callout, keyed to the list under each sheet in wireframes.md. */
const DOT = (x, y, n) =>
  `<g><circle cx="${x}" cy="${y}" r="9" fill="${ACCENT}"/><text x="${x}" y="${
    y + 3.5
  }" ${FONT} font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">${n}</text></g>`;

/** Browser bar, app header and the M1 footer, shared by every sheet. */
function shell({ url, active, H }) {
  const nav = [
    ['My trees', 620],
    ['Log in', 706],
  ];
  return [
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<rect x="0" y="0" width="${W}" height="30" fill="#efece5"/>`,
    `<rect x="16" y="7" width="620" height="17" rx="8" fill="#ffffff" stroke="${RULE}"/>`,
    T(26, 20, url, { size: 11, fill: MUTED }),
    `<rect x="0" y="30" width="${W}" height="44" fill="${SURF}"/>`,
    `<rect x="0" y="${H - 40}" width="${W}" height="40" fill="${SURF}"/>`,
    LINE(0, 74, W, 74),
    LINE(0, H - 40, W, H - 40),
    T(24, 58, 'Puong', { size: 16, weight: 700 }),
    ...nav.map(([label, x]) =>
      T(x, 58, label, {
        size: 13,
        weight: active === label ? 700 : 400,
      }),
    ),
    T(936, 58, 'Sokuntheary Chheng · owner', {
      size: 12,
      fill: MUTED,
      anchor: 'end',
    }),
    T(24, H - 15, 'M1 demo controls ▸   signed-in-as switcher · arm a one-shot failure · reset the data', {
      size: 11.5,
      fill: MUTED,
    }),
  ].join('');
}

const crumb = (parts) => T(24, 100, parts, { size: 12, fill: MUTED });

function wrap(lines, x, y, lh, opts = {}) {
  return lines.map((l, i) => T(x, y + i * lh, l, opts)).join('');
}

function page(name, H, body, title) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<title>${esc(title)}</title>`,
    body,
    `</svg>`,
  ].join('\n');
  writeFileSync(join(outDir, `${name}.svg`), `${svg}\n`);
  console.log(`  wrote ${name}.svg`);
}

/* ------------------------------------------------------------------ */
/* 1 — Login                                                           */
/* ------------------------------------------------------------------ */
{
  const H = 520;
  const body = [
    shell({ url: 'puong.dev/login', active: 'Log in', H }),
    BOX(300, 116, 360, 306),
    T(324, 152, 'Log in', { size: 17, weight: 700 }),
    T(324, 188, 'Email', { size: 12, weight: 600 }),
    BOX(324, 196, 312, 32, { fill: SURF, rx: 8 }),
    T(334, 217, 'owner@puong.dev', { size: 12, fill: MUTED }),
    T(324, 254, 'Password', { size: 12, weight: 600 }),
    BOX(324, 262, 312, 32, { fill: SURF, rx: 8 }),
    T(334, 283, '••••••••', { size: 12, fill: MUTED }),
    BOX(324, 316, 120, 34, { fill: ACCENT, stroke: ACCENT, rx: 8 }),
    T(384, 338, 'Log in', { size: 13, weight: 600, fill: SURF, anchor: 'middle' }),
    wrap(
      [
        'Authentication itself is M3 — until then the footer',
        'switches between the three seeded accounts so the',
        'permission matrix can be demonstrated by hand.',
      ],
      324,
      380,
      15,
      { size: 11, fill: MUTED, italic: true },
    ),
    DOT(126, 15, 1),
    DOT(458, 333, 2),
    DOT(640, 501, 3),
  ].join('\n');
  page('login', H, body, 'Wireframe — login screen (/login)');
}

/* ------------------------------------------------------------------ */
/* 2 — Home: my trees                                                  */
/* ------------------------------------------------------------------ */
{
  const H = 500;
  const cards = [
    ['Mango family', 'Four generations · 23 people · you are the owner', 248],
    ['Mangosteen family', 'Seeded empty on purpose, to show what an empty tree looks like (FR-8.4)', 334],
  ];
  const stats = [
    ['Trees', '2', 24],
    ['People', '23', 332],
    ['Memories', '5', 640],
  ];
  const body = [
    shell({ url: 'puong.dev/', active: 'My trees', H }),
    T(24, 112, 'My trees', { size: 22, weight: 700 }),
    T(24, 134, 'Every tree you belong to, in one place.', { size: 12.5, fill: MUTED }),
    /* The reference's primary slot. M1 has no create-tree flow behind it,
       so the wireframe draws it doing exactly what it does — nothing —
       and says so, rather than drawing a button that looks ready to work. */
    BOX(778, 96, 158, 36, { fill: BARE, stroke: RULE, rx: 8 }),
    T(857, 119, 'Add a family', { size: 13, weight: 600, fill: MUTED, anchor: 'middle' }),
    T(936, 150, 'Not in M1 yet', { size: 10.5, fill: MUTED, italic: true, anchor: 'end' }),
    ...stats.flatMap(([label, value, x]) => [
      BOX(x, 164, 296, 64, { fill: BARE }),
      T(x + 16, 188, label, { size: 11.5, fill: MUTED }),
      T(x + 16, 216, value, { size: 20, weight: 700 }),
    ]),
    ...cards.flatMap(([name, note, y]) => [
      BOX(24, y, 620, 74),
      T(40, y + 28, name, { size: 15, weight: 700 }),
      T(40, y + 52, note, { size: 12, fill: MUTED }),
      T(620, y + 40, '→', { size: 15, fill: ACCENT, anchor: 'end' }),
    ]),
    T(24, 444, 'The three states this list can be in — loading, empty, error — are on sheet 7.', {
      size: 12,
      fill: MUTED,
      italic: true,
    }),
    DOT(104, 15, 1),
    DOT(857, 114, 2),
    DOT(352, 172, 3),
    DOT(660, 264, 4),
    DOT(624, 440, 5),
  ].join('\n');
  page('home', H, body, 'Wireframe — home, my trees (/)');
}

/* ------------------------------------------------------------------ */
/* 3 — Tree view (detail page with a route parameter)                  */
/* ------------------------------------------------------------------ */
{
  const H = 900;
  /* One band per generation, oldest at the top — the orientation the
     tree-first screen draws in, and the one design.md §1.5 notes. */
  const CARD_W = 150;
  const CARD_H = 64;
  const bands = [
    {
      label: 'GENERATION 1',
      labelY: 340,
      y: 350,
      cards: [
        ['Mr. Mango', '1935 – 2010', false],
        ['Mrs. Mangosteen', '1938 –', false],
        ['Apple Bottom', '1959 –', true],
      ],
      more: null,
    },
    {
      label: 'GENERATION 2',
      labelY: 446,
      y: 456,
      cards: [
        ['Jack Fruitson', '1960 –', false],
        ['Cherry Berry', '1962 –', false],
        ['Ms. Watermelon', '1963 –', false],
      ],
      more: '… 4 more',
      selected: 1,
    },
    {
      label: 'GENERATION 3',
      labelY: 552,
      y: 562,
      cards: [
        ['Chheng Sokuntheary', '1985 –', false],
        ['Papaya Parker', '1988 –', false],
        ['Grape Gatsby', '1987 –', false],
      ],
      more: '… 5 more',
    },
  ];
  const bandXs = [231, 405, 579];

  /** A parent line: down from the parents' midpoint, across, down again. */
  const elbow = (x1, y1, x2, y2) =>
    `<path d="M${x1} ${y1}V${(y1 + y2) / 2}H${x2}V${y2}" fill="none" stroke="${RULE}" stroke-width="1.5"/>`;
  /** A couple's own link: a short bridge across the gap between cards. */
  const bridge = (x1, x2, y) =>
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="1.5"/>`;

  const stats = [
    ['Family members', '23', 24],
    ['Generations', '4', 332],
    ['Memories', '5', 640],
  ];

  const body = [
    shell({ url: 'puong.dev/trees/t1?person=p04', active: 'My trees', H }),
    crumb('My trees / Mango family'),
    T(24, 136, 'Mango family', { size: 22, weight: 700 }),
    T(24, 158, 'Four generations of the Mango family, from Mr. Mango and Mrs. Mangosteen in 1935 to the children born after 2010.', { size: 12, fill: MUTED }),
    T(24, 178, 'You are owner here', { size: 11.5, fill: MUTED }),
    /* The screen's one primary action: the working, role-gated write M1 has. */
    BOX(790, 112, 146, 36, { fill: ACCENT, stroke: ACCENT, rx: 8 }),
    T(863, 135, 'Add a memory', { size: 13, weight: 600, fill: SURF, anchor: 'middle' }),

    ...stats.flatMap(([label, value, x]) => [
      BOX(x, 196, 296, 64, { fill: BARE }),
      T(x + 16, 220, label, { size: 11.5, fill: MUTED }),
      T(x + 16, 248, value, { size: 20, weight: 700 }),
    ]),

    /* The workspace: a paper toolbar over a paper canvas, one border. */
    BOX(24, 272, 912, 468, { fill: SURF }),
    BOX(36, 282, 134, 32, { fill: SURF, stroke: RULE, rx: 8 }),
    `<rect x="48" y="291" width="12" height="12" rx="3" fill="none" stroke="${ACCENT}" stroke-width="1.6"/>`,
    T(68, 303, 'Family tree', { size: 12.5, weight: 600 }),
    T(192, 303, 'Memories', { size: 12.5, fill: MUTED }),
    /* These move the graph — they are not decoration. */
    BOX(744, 286, 26, 26, { fill: SURF, rx: 8 }),
    T(757, 304, '−', { size: 14, anchor: 'middle' }),
    T(790, 304, '80%', { size: 12, fill: MUTED, anchor: 'middle' }),
    BOX(816, 286, 26, 26, { fill: SURF, rx: 8 }),
    T(829, 304, '+', { size: 14, anchor: 'middle' }),
    BOX(862, 286, 26, 26, { fill: SURF, rx: 8 }),
    `<rect x="869" y="293" width="12" height="12" fill="none" stroke="${INK}" stroke-width="1.4"/>`,
    LINE(24, 318, 936, 318),

    /* Two of the couple's children, and a person nobody has linked yet. */
    bridge(381, 405, 382),
    elbow(393, 414, 306, 456),
    elbow(393, 414, 480, 456),
    bridge(381, 405, 488),
    elbow(393, 520, 306, 562),
    elbow(393, 520, 480, 562),

    ...bands.flatMap((band) => {
      const out = [
        T(480, band.labelY, band.label, {
          size: 10.5,
          fill: MUTED,
          weight: 600,
          anchor: 'middle',
        }),
      ];
      band.cards.forEach(([name, dates, flagged], i) => {
        const x = bandXs[i];
        const isSel = band.selected === i;
        out.push(
          BOX(x, band.y, CARD_W, CARD_H, {
            fill: isSel ? BARE : SURF,
            stroke: isSel ? ACCENT : RULE,
            sw: isSel ? 2 : 1,
          }),
          T(x + 16, band.y + 26, name, { size: 12, weight: 600 }),
          T(x + 16, band.y + 44, dates, { size: 10.5, fill: MUTED }),
        );
        if (flagged) {
          out.push(
            T(x + 16, band.y + 58, 'not linked yet', { size: 10, fill: DANGER, italic: true }),
          );
        }
      });
      if (band.more) out.push(T(745, band.y + 38, band.more, { size: 11, fill: MUTED }));
      return out;
    }),

    /* The selected person's panel — inside the workspace, below the graph. */
    `<rect x="24" y="640" width="4" height="100" fill="${ACCENT}"/>`,
    T(44, 668, 'Cherry Berry', { size: 15, weight: 700 }),
    T(44, 692, 'SPOUSE', { size: 10.5, fill: MUTED, weight: 600 }),
    T(44, 712, 'Jack Fruitson', { size: 12.5, fill: ACCENT }),
    T(260, 692, 'CHILDREN', { size: 10.5, fill: MUTED, weight: 600 }),
    T(260, 712, 'Chheng Sokuntheary, Papaya Parker', { size: 12.5, fill: ACCENT }),
    T(560, 692, 'PARENTS', { size: 10.5, fill: MUTED, weight: 600 }),
    T(560, 712, 'not recorded in this tree', { size: 12.5, fill: MUTED, italic: true }),
    T(936, 732, 'Open Cherry Berry’s page →', { size: 12.5, weight: 600, fill: ACCENT, anchor: 'end' }),

    /* The two supporting cards: one that works, one that says it does not. */
    BOX(24, 752, 450, 84),
    `<rect x="40" y="770" width="32" height="32" rx="8" fill="${BARE}"/>`,
    T(84, 786, 'Family memories', { size: 14, weight: 600 }),
    T(84, 808, 'Preserve stories and photographs', { size: 11.5, fill: MUTED }),
    BOX(486, 752, 450, 84),
    `<rect x="502" y="770" width="32" height="32" rx="8" fill="${BARE}"/>`,
    T(546, 786, 'Life events', { size: 14, weight: 600 }),
    T(546, 808, 'Birthdays, milestones, anniversaries', { size: 11.5, fill: MUTED }),
    T(546, 826, 'Not in M1 yet', { size: 10.5, fill: MUTED, italic: true }),

    DOT(204, 15, 1),
    DOT(300, 15, 2),
    DOT(863, 114, 3),
    DOT(352, 204, 4),
    DOT(170, 174, 5),
    DOT(726, 299, 6),
    DOT(745, 356, 7),
    DOT(440, 435, 8),
    DOT(565, 470, 9),
    DOT(900, 662, 10),
    DOT(440, 772, 11),
  ].join('\n');
  page('tree-view', H, body, 'Wireframe — family tree canvas (/trees/:treeId)');
}

/* ------------------------------------------------------------------ */
/* 4 — Person page                                                     */
/* ------------------------------------------------------------------ */
{
  const H = 760;
  const facts = [
    ['Nickname', 'Mango'],
    ['Born', '1935-03-12'],
    ['Died', '2010-08-04'],
  ];
  const memories = [
    ['The wedding of Mango and Mangosteen', '1958-02-14', 'WHOLE TREE', false, 418],
    ['What Mr. Mango said about the years after 1975', '2008-06-11', 'ONLY ME', true, 514],
    ['A childhood in the old house', 'no date recorded', 'WHOLE TREE', false, 610],
  ];
  const body = [
    shell({ url: 'puong.dev/trees/t1/people/p01', active: 'My trees', H }),
    crumb('My trees / Mango family / Mr. Mango'),
    T(24, 136, 'Mr. Mango', { size: 22, weight: 700 }),
    ...facts.flatMap(([k, v], i) => [
      T(24, 168 + i * 24, k, { size: 12, fill: MUTED }),
      T(160, 168 + i * 24, v, { size: 12 }),
    ]),
    T(24, 256, 'Eldest son of the original household; kept the orchard after 1975.', {
      size: 13,
      fill: MUTED,
      italic: true,
    }),
    BOX(24, 276, 300, 64),
    T(40, 300, 'SPOUSE', { size: 10.5, fill: MUTED, weight: 600 }),
    T(40, 324, 'Mrs. Mangosteen', { size: 13, fill: ACCENT }),
    BOX(340, 276, 300, 64),
    T(356, 300, 'CHILDREN', { size: 10.5, fill: MUTED, weight: 600 }),
    T(356, 324, 'Jack Fruitson, Ms. Watermelon, Peachy Chan', { size: 13, fill: ACCENT }),
    LINE(24, 368, 936, 368),
    T(24, 402, 'Memories', { size: 16, weight: 700 }),
    T(936, 402, '+ Add a memory', { size: 13, weight: 600, fill: ACCENT, anchor: 'end' }),
    ...memories.flatMap(([title, meta, vis, danger, y]) => [
      BOX(24, y, 912, 84),
      T(40, y + 30, title, { size: 13.5, weight: 600 }),
      T(920, y + 30, vis, {
        size: 10,
        weight: 600,
        fill: danger ? DANGER : MUTED,
        anchor: 'end',
      }),
      T(40, y + 52, meta, { size: 11, fill: MUTED }),
      BAR(40, y + 62, 660),
    ]),
    DOT(214, 15, 1),
    DOT(146, 164, 2),
    DOT(832, 398, 3),
    DOT(846, 540, 4),
    DOT(836, 444, 5),
  ].join('\n');
  page('person', H, body, 'Wireframe — person page (/trees/:treeId/people/:personId)');
}

/* ------------------------------------------------------------------ */
/* 5 — Memory form with validation                                     */
/* ------------------------------------------------------------------ */
{
  const H = 840;
  const body = [
    shell({ url: 'puong.dev/trees/t1/people/p01/memories/new', active: 'My trees', H }),
    crumb('p01 / new memory'),
    T(24, 136, 'Add a memory', { size: 22, weight: 700 }),

    T(24, 176, 'Title', { size: 12.5, weight: 600 }),
    BOX(24, 184, 520, 32, { fill: SURF, stroke: DANGER, rx: 8 }),
    T(34, 205, '   ', { size: 12 }),
    T(24, 236, 'A title is required.', { size: 11.5, fill: DANGER, weight: 600 }),

    T(24, 268, 'Body', { size: 12.5, weight: 600 }),
    BOX(24, 276, 520, 88, { fill: SURF, stroke: DANGER, rx: 8 }),
    T(24, 388, 'A body is required.', { size: 11.5, fill: DANGER, weight: 600 }),

    T(24, 420, 'Occurred on', { size: 12.5, weight: 600 }),
    BOX(24, 428, 240, 32, { fill: SURF, rx: 8 }),
    T(34, 449, '1998-12-24', { size: 12, fill: MUTED }),
    T(24, 480, 'Optional.', { size: 11.5, fill: MUTED }),

    BOX(24, 500, 520, 104),
    T(40, 524, 'Who can see it', { size: 12.5, weight: 600 }),
    `<circle cx="48" cy="552" r="7" fill="#ffffff" stroke="${INK}"/>`,
    `<circle cx="48" cy="552" r="3.5" fill="${ACCENT}"/>`,
    T(64, 556, 'Everyone in the tree', { size: 12.5 }),
    `<circle cx="48" cy="582" r="7" fill="#ffffff" stroke="${INK}"/>`,
    T(64, 586, 'Only me', { size: 12.5 }),
    T(150, 586, 'nobody else sees it — not even the owner (FR-6.6)', {
      size: 11,
      fill: MUTED,
      italic: true,
    }),

    T(24, 634, 'Photograph', { size: 12.5, weight: 600 }),
    BOX(24, 642, 520, 32, { fill: SURF, rx: 8 }),
    T(34, 663, 'Choose file…', { size: 12, fill: MUTED }),
    T(24, 694, 'Optional — JPEG, PNG, WebP up to 5 MB.', { size: 11.5, fill: MUTED }),

    BOX(24, 716, 140, 34, { fill: ACCENT, stroke: ACCENT, rx: 8 }),
    T(94, 738, 'Save memory', { size: 13, weight: 600, fill: SURF, anchor: 'middle' }),
    BOX(180, 716, 90, 34, { fill: SURF, rx: 8 }),
    T(225, 738, 'Clear', { size: 13, anchor: 'middle' }),

    T(24, 784, '2 fields need attention before this can be saved.', {
      size: 12.5,
      weight: 700,
      fill: DANGER,
    }),

    DOT(300, 15, 1),
    DOT(176, 232, 2),
    DOT(392, 780, 3),
    DOT(536, 512, 4),
    DOT(536, 686, 5),
    DOT(286, 733, 6),
  ].join('\n');
  page('memory-form', H, body, 'Wireframe — new memory form with validation');
}

/* ------------------------------------------------------------------ */
/* 6 — Search (stretch feature)                                        */
/* ------------------------------------------------------------------ */
{
  const H = 620;
  const rows = [
    ['PERSON', 'Mr. Mango', 'Mango · 1935', 248],
    ['PERSON', 'Mrs. Mangosteen', 'Mangosteen · 1938 –', 316],
    ['MEMORY', 'The wedding of Mango and Mangosteen', '1958-02-14 · WHOLE TREE', 384],
    ['MEMORY', 'What Mr. Mango said about the years after 1975', '2008-06-11 · PRIVATE', 452],
  ];
  const body = [
    shell({ url: 'puong.dev/trees/t1/search?q=mango&page=1', active: 'My trees', H }),
    crumb('My trees / Mango family / search'),
    T(24, 136, 'Search', { size: 22, weight: 700 }),
    T(24, 172, 'Name, nickname or memory text', { size: 12.5, weight: 600 }),
    BOX(24, 180, 440, 32, { fill: SURF, rx: 8 }),
    T(34, 201, 'mango', { size: 12.5 }),
    T(24, 234, 'Case- and accent-insensitive: “mango” finds “Mr. Mango”, “hoi an” finds “Hội An”.', {
      size: 11.5,
      fill: MUTED,
      italic: true,
    }),
    T(24, 268, '4 results, page 1 of 1', { size: 12, fill: MUTED }),
    ...rows.flatMap(([kind, title, detail, y]) => [
      BOX(24, y, 912, 64, { fill: SURF }),
      T(40, y + 28, kind, { size: 10, fill: MUTED, weight: 600 }),
      T(140, y + 28, title, { size: 13.5, weight: 600 }),
      T(140, y + 48, detail, { size: 11.5, fill: MUTED }),
    ]),
    BOX(24, 536, 100, 32, { fill: BARE, stroke: RULE, rx: 8 }),
    T(74, 557, '‹ Previous', { size: 12, anchor: 'middle', fill: MUTED }),
    BOX(136, 536, 76, 32, { fill: BARE, stroke: RULE, rx: 8 }),
    T(174, 557, 'Next ›', { size: 12, anchor: 'middle', fill: MUTED }),
    T(256, 557, 'greyed out on the only page — ?page= still rides in the URL', {
      size: 11.5,
      fill: MUTED,
      italic: true,
    }),
    DOT(318, 15, 1),
    DOT(596, 230, 2),
    DOT(920, 280, 3),
    DOT(920, 484, 4),
    DOT(234, 552, 5),
  ].join('\n');
  page('search', H, body, 'Wireframe — search (/trees/:treeId/search)');
}

/* ------------------------------------------------------------------ */
/* 7 — the three states every list can be in                           */
/* ------------------------------------------------------------------ */
{
  const H = 420;
  const panels = [
    { x: 24, title: 'Loading', n: 1 },
    { x: 336, title: 'Empty', n: 2 },
    { x: 648, title: 'Error', n: 3 },
  ];
  const body = [
    shell({ url: 'puong.dev/', active: 'My trees', H }),
    T(24, 112, 'My trees', { size: 22, weight: 700 }),
    ...panels.map((p) => T(p.x, 146, p.title, { size: 12, weight: 700, fill: MUTED })),

    BOX(24, 158, 288, 152, { fill: SURF }),
    `<circle cx="52" cy="192" r="8" fill="none" stroke="${MUTED}" stroke-width="2"/>`,
    T(70, 197, 'Loading…', { size: 13, fill: MUTED }),
    T(40, 292, 'role="status" · aria-live="polite"', { size: 10.5, fill: MUTED }),

    BOX(336, 158, 288, 152, { fill: SURF }),
    ...wrap(
      [
        'You do not belong to a tree yet.',
        'Ask an owner to invite you, or create one.',
      ],
      352,
      196,
      20,
      { size: 12.5 },
    ),
    T(352, 292, 'the empty copy is written per screen', { size: 10.5, fill: MUTED }),

    BOX(648, 158, 288, 152, { fill: SURF, stroke: RULE }),
    `<rect x="648" y="158" width="4" height="152" fill="${DANGER}"/>`,
    T(664, 192, 'Something went wrong.', { size: 13, weight: 700, fill: DANGER }),
    ...wrap(
      ['The trees.list request failed. This failure', 'was requested, to show the error state.'],
      664,
      216,
      17,
      { size: 11.5, fill: MUTED },
    ),
    BOX(664, 248, 90, 30, { fill: SURF, rx: 8 }),
    T(709, 268, 'Try again', { size: 12, anchor: 'middle' }),
    T(664, 292, 'role="alert"', { size: 10.5, fill: MUTED }),

    T(24, 344, 'A fourth state — idle — renders nothing: no spinner for a request nobody has made.', {
      size: 12,
      fill: MUTED,
      italic: true,
    }),
    DOT(300, 170, 1),
    DOT(612, 170, 2),
    DOT(924, 170, 3),
    DOT(700, 340, 4),
  ].join('\n');
  page('states', H, body, 'Wireframe — loading, empty and error states');
}

console.log('\nwireframes regenerated in docs/wireframes/');

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
const INK = '#2f2a24';
const MUTED = '#7a736a';
const RULE = '#cfc9bd';
const SURF = '#faf8f3';
const ACCENT = '#2f5d8a';
const DANGER = '#a4322a';
const BARE = '#e4e0d6';

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
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 6}" fill="${
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
    BOX(324, 196, 312, 32, { fill: '#ffffff' }),
    T(334, 217, 'owner@puong.dev', { size: 12, fill: MUTED }),
    T(324, 254, 'Password', { size: 12, weight: 600 }),
    BOX(324, 262, 312, 32, { fill: '#ffffff' }),
    T(334, 283, '••••••••', { size: 12, fill: MUTED }),
    BOX(324, 316, 120, 34, { fill: ACCENT, stroke: ACCENT }),
    T(384, 338, 'Log in', { size: 13, weight: 600, fill: '#ffffff', anchor: 'middle' }),
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
  const H = 480;
  const cards = [
    ['Nguyễn family', 'Four generations · 23 people · you are the owner', 130],
    ['Trần family', 'Seeded empty on purpose, to show what an empty tree looks like (FR-8.4)', 216],
  ];
  const body = [
    shell({ url: 'puong.dev/', active: 'My trees', H }),
    T(24, 112, 'My trees', { size: 22, weight: 700 }),
    ...cards.flatMap(([name, note, y]) => [
      BOX(24, y, 620, 74),
      T(40, y + 28, name, { size: 15, weight: 700 }),
      T(40, y + 52, note, { size: 12, fill: MUTED }),
      T(620, y + 40, '→', { size: 15, fill: ACCENT, anchor: 'end' }),
    ]),
    T(24, 330, 'The three states this list can be in — loading, empty, error — are on sheet 7.', {
      size: 12,
      fill: MUTED,
      italic: true,
    }),
    DOT(104, 15, 1),
    DOT(660, 152, 2),
    DOT(624, 326, 3),
  ].join('\n');
  page('home', H, body, 'Wireframe — home, my trees (/)');
}

/* ------------------------------------------------------------------ */
/* 3 — Tree view (detail page with a route parameter)                  */
/* ------------------------------------------------------------------ */
{
  const H = 740;
  const cols = [
    {
      x: 44,
      title: 'GENERATION 1',
      cards: [
        ['Nguyễn Văn An', '1935 – 2010', false],
        ['Trần Thị Bình', '1938 –', false],
        ['Hoàng Thị Bé', '1959 –', true],
      ],
      more: null,
    },
    {
      x: 272,
      title: 'GENERATION 2',
      cards: [
        ['Nguyễn Văn Cường', '1960 –', false],
        ['Lê Thị Cúc', '1962 –', false],
        ['Nguyễn Thị Hạnh', '1963 –', false],
      ],
      more: '… 3 more',
      selected: 1,
    },
    {
      x: 500,
      title: 'GENERATION 3',
      cards: [
        ['Trần Văn Dũng', '1961 –', false],
        ['Nguyễn Văn Hải', '1967 – 2019', false],
        ['Phạm Thị Oanh', '1969 –', false],
      ],
      more: '… 6 more',
    },
    {
      x: 728,
      title: 'GENERATION 4',
      cards: [
        ['Nguyễn Minh Khoa', '1988 –', false],
        ['Trần Bảo Long', '1991 –', false],
        ['Lê Thu Hà', '1994 –', false],
      ],
      more: '… 2 more',
    },
  ];

  const body = [
    shell({ url: 'puong.dev/trees/t1?person=p04', active: 'My trees', H }),
    crumb('My trees / Nguyễn family'),
    T(24, 136, 'Nguyễn family', { size: 22, weight: 700 }),
    T(936, 134, 'You are owner here', { size: 12, fill: MUTED, anchor: 'end' }),
    BOX(24, 156, 912, 296, { fill: '#ffffff' }),
    ...cols.flatMap((col) => {
      const out = [T(col.x, 184, col.title, { size: 10.5, fill: MUTED, weight: 600 })];
      col.cards.forEach(([name, dates, flagged], i) => {
        const y = 196 + i * 58;
        const h = flagged ? 64 : 50;
        const isSel = col.selected === i;
        out.push(
          BOX(col.x, y, 200, h, {
            fill: '#ffffff',
            stroke: isSel ? ACCENT : RULE,
            sw: isSel ? 2 : 1,
          }),
          T(col.x + 12, y + 19, name, { size: 12, weight: 600 }),
          T(col.x + 12, y + 36, dates, { size: 10.5, fill: MUTED }),
        );
        if (flagged) {
          out.push(T(col.x + 12, y + 54, 'not linked yet', { size: 10, fill: DANGER, italic: true }));
        }
      });
      if (col.more) out.push(T(col.x + 12, 396, col.more, { size: 11, fill: MUTED }));
      return out;
    }),
    BOX(24, 474, 912, 196),
    `<rect x="24" y="474" width="4" height="196" fill="${ACCENT}"/>`,
    T(44, 506, 'Lê Thị Cúc', { size: 15, weight: 700 }),
    T(44, 528, 'Cúc · born 1962 in Cần Thơ', { size: 12, fill: MUTED }),
    T(44, 560, 'SPOUSE', { size: 10.5, fill: MUTED, weight: 600 }),
    T(44, 580, 'Nguyễn Văn Cường', { size: 12.5, fill: ACCENT }),
    T(260, 560, 'CHILDREN', { size: 10.5, fill: MUTED, weight: 600 }),
    T(260, 580, 'Lê Nhật Nam', { size: 12.5, fill: ACCENT }),
    T(44, 616, 'PARENTS', { size: 10.5, fill: MUTED, weight: 600 }),
    T(44, 636, 'not recorded in this tree', { size: 12.5, fill: MUTED, italic: true }),
    T(936, 646, 'Open Lê Thị Cúc’s page →', { size: 12.5, weight: 600, fill: ACCENT, anchor: 'end' }),
    DOT(204, 15, 1),
    DOT(300, 15, 2),
    DOT(152, 180, 3),
    DOT(482, 274, 4),
    DOT(252, 372, 5),
    DOT(798, 130, 6),
    DOT(742, 642, 7),
  ].join('\n');
  page('tree-view', H, body, 'Wireframe — family tree canvas (/trees/:treeId)');
}

/* ------------------------------------------------------------------ */
/* 4 — Person page                                                     */
/* ------------------------------------------------------------------ */
{
  const H = 760;
  const facts = [
    ['Nickname', 'Ông An'],
    ['Born', '1935-04-02'],
    ['Died', '2010-11-19'],
  ];
  const memories = [
    ['The wedding of An and Bình', '1958-12-24', 'WHOLE TREE', false, 418],
    ['What An said about the years after 1975', '2008-06-10', 'ONLY ME', true, 514],
    ['A childhood in the old house', 'no date recorded', 'WHOLE TREE', false, 610],
  ];
  const body = [
    shell({ url: 'puong.dev/trees/t1/people/p01', active: 'My trees', H }),
    crumb('My trees / Nguyễn family / Nguyễn Văn An'),
    T(24, 136, 'Nguyễn Văn An', { size: 22, weight: 700 }),
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
    T(40, 324, 'Trần Thị Bình', { size: 13, fill: ACCENT }),
    BOX(340, 276, 300, 64),
    T(356, 300, 'CHILDREN', { size: 10.5, fill: MUTED, weight: 600 }),
    T(356, 324, 'Cường, Hạnh, Dũng, Hải', { size: 13, fill: ACCENT }),
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
    BOX(24, 184, 520, 32, { fill: '#ffffff', stroke: DANGER }),
    T(34, 205, '   ', { size: 12 }),
    T(24, 236, 'A title is required.', { size: 11.5, fill: DANGER, weight: 600 }),

    T(24, 268, 'Body', { size: 12.5, weight: 600 }),
    BOX(24, 276, 520, 88, { fill: '#ffffff', stroke: DANGER }),
    T(24, 388, 'A body is required.', { size: 11.5, fill: DANGER, weight: 600 }),

    T(24, 420, 'Occurred on', { size: 12.5, weight: 600 }),
    BOX(24, 428, 240, 32, { fill: '#ffffff' }),
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
    BOX(24, 642, 520, 32, { fill: '#ffffff' }),
    T(34, 663, 'Choose file…', { size: 12, fill: MUTED }),
    T(24, 694, 'Optional — JPEG, PNG, WebP up to 5 MB.', { size: 11.5, fill: MUTED }),

    BOX(24, 716, 140, 34, { fill: ACCENT, stroke: ACCENT }),
    T(94, 738, 'Save memory', { size: 13, weight: 600, fill: '#ffffff', anchor: 'middle' }),
    BOX(180, 716, 90, 34, { fill: '#ffffff' }),
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
    ['PERSON', 'Nguyễn Văn An', 'Ông An · 1935', 248],
    ['MEMORY', 'What An said about the years after 1975', '2008-06-10 · PRIVATE', 320],
    ['PERSON', 'Nguyễn Thị Hạnh', 'Hạnh · 1963', 392],
  ];
  const body = [
    shell({ url: 'puong.dev/trees/t1/search?q=nguyen&page=2', active: 'My trees', H }),
    crumb('My trees / Nguyễn family / search'),
    T(24, 136, 'Search', { size: 22, weight: 700 }),
    T(24, 172, 'Name, nickname or memory text', { size: 12.5, weight: 600 }),
    BOX(24, 180, 440, 32, { fill: '#ffffff' }),
    T(34, 201, 'nguyen', { size: 12.5 }),
    T(24, 234, 'Accent-insensitive: “nguyen” finds “Nguyễn”.', {
      size: 11.5,
      fill: MUTED,
      italic: true,
    }),
    T(24, 268, '8 results, page 2 of 2', { size: 12, fill: MUTED }),
    ...rows.flatMap(([kind, title, detail, y]) => [
      BOX(24, y, 912, 64, { fill: '#ffffff' }),
      T(40, y + 28, kind, { size: 10, fill: MUTED, weight: 600 }),
      T(140, y + 28, title, { size: 13.5, weight: 600 }),
      T(140, y + 48, detail, { size: 11.5, fill: MUTED }),
    ]),
    BOX(24, 476, 100, 32, { fill: '#ffffff' }),
    T(74, 497, '‹ Previous', { size: 12, anchor: 'middle' }),
    BOX(136, 476, 76, 32, { fill: '#ffffff' }),
    T(174, 497, 'Next ›', { size: 12, anchor: 'middle' }),
    DOT(318, 15, 1),
    DOT(340, 230, 2),
    DOT(920, 280, 3),
    DOT(920, 352, 4),
    DOT(228, 492, 5),
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

    BOX(24, 158, 288, 152, { fill: '#ffffff' }),
    `<circle cx="52" cy="192" r="8" fill="none" stroke="${MUTED}" stroke-width="2"/>`,
    T(70, 197, 'Loading…', { size: 13, fill: MUTED }),
    T(40, 292, 'role="status" · aria-live="polite"', { size: 10.5, fill: MUTED }),

    BOX(336, 158, 288, 152, { fill: '#ffffff' }),
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

    BOX(648, 158, 288, 152, { fill: '#ffffff', stroke: RULE }),
    `<rect x="648" y="158" width="4" height="152" fill="${DANGER}"/>`,
    T(664, 192, 'Something went wrong.', { size: 13, weight: 700, fill: DANGER }),
    ...wrap(
      ['The trees.list request failed. This failure', 'was requested, to show the error state.'],
      664,
      216,
      17,
      { size: 11.5, fill: MUTED },
    ),
    BOX(664, 248, 90, 30, { fill: '#ffffff' }),
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

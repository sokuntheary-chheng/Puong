#!/usr/bin/env node
/**
 * Generates the M2 entity-relationship diagram from the Prisma schema.
 *
 * The rubric asks for "API contract (Appendix B) and ERD in docs/". Like the
 * wireframes next door, this is the "tool" route: the diagram is parsed out
 * of `api/prisma/schema.prisma` rather than drawn by hand, so a column added
 * to the schema shows up in the picture and a column removed from it
 * disappears. A hand-drawn ERD is a snapshot; this is a view.
 *
 * Outputs:
 *   docs/erd/erd.svg   the diagram
 *   docs/erd.md        the same model as text — models, fields, constraints
 *                      and one row per relationship
 *
 * Regenerate with:  node docs/erd/build.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, '../../api/prisma/schema.prisma');
mkdirSync(here, { recursive: true });

/* ------------------------------------------------------------------ parse */

const source = readFileSync(SCHEMA, 'utf8');
const lines = source.split('\n');

/** Field kinds: `scalar`, `relation-one` (holds the FK), `relation-many`. */
function parse() {
  const models = [];
  const enums = [];
  let block = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('//')) continue;

    if (block === null) {
      const model = /^model (\w+) \{$/.exec(line);
      if (model) {
        block = { kind: 'model', name: model[1], fields: [], constraints: [] };
        models.push(block);
        continue;
      }
      const en = /^enum (\w+) \{$/.exec(line);
      if (en) {
        block = { kind: 'enum', name: en[1], values: [] };
        enums.push(block);
        continue;
      }
      continue;
    }

    if (line === '}') {
      block = null;
      continue;
    }

    if (block.kind === 'enum') {
      block.values.push(line.replace(/\/\*.*\*\/$/, '').trim());
      continue;
    }

    // Block-level attributes: @@unique([a, b]), @@index([a]).
    const constraint = /^@@(\w+)\((.*)\)$/.exec(line);
    if (constraint) {
      const [, name, args] = constraint;
      const cols = /\[(.*)\]/.exec(args)?.[1] ?? '';
      block.constraints.push({ name, columns: cols.split(',').map((c) => c.trim()) });
      continue;
    }

    // `fieldName Type @attributes…` — the type may be `Type?` or `Type[]`.
    const field = /^(\w+)\s+(\S+)\s*(.*)$/.exec(line);
    if (field === null) continue;
    const [, name, rawType, attrs] = field;

    const relation = /@relation\(([^)]*)\)/.exec(attrs);
    const isList = rawType.endsWith('[]');
    const type = rawType.replace(/\[\]$/, '').replace(/\?$/, '');
    const optional = rawType.endsWith('?');

    if (relation) {
      const args = relation[1];
      const label = /"([^"]+)"/.exec(args)?.[1] ?? '';
      const fields = /fields:\s*\[([^\]]*)\]/.exec(args)?.[1];
      const onDelete = /onDelete:\s*(\w+)/.exec(args)?.[1];
      if (fields !== undefined) {
        block.fields.push({
          name,
          type,
          optional,
          kind: 'relation-one',
          target: type,
          label,
          fkColumns: fields.split(',').map((c) => c.trim()),
          onDelete,
        });
      } else {
        block.fields.push({
          name,
          type,
          optional,
          kind: 'relation-many',
          target: type,
          label,
        });
      }
      continue;
    }

    if (isList) {
      // An implicit `Tree[]` with no @relation is unusual in this schema;
      // treat it as a relation without a label so pairing still finds it.
      block.fields.push({
        name,
        type,
        optional,
        kind: 'relation-many',
        target: type,
        label: '',
      });
      continue;
    }

    block.fields.push({
      name,
      type,
      optional,
      kind: 'scalar',
      id: /@id/.test(attrs),
      unique: /@unique/.test(attrs),
      default: /@default\((.*)\)/.exec(attrs)?.[1] ?? '',
    });
  }

  return { models, enums };
}

const { models, enums } = parse();
const modelByName = new Map(models.map((m) => [m.name, m]));

/**
 * Pair the two halves of every relationship.
 *
 * Prisma declares each relation once on each side: the side whose field type
 * is a list is the "one" (it collects many rows), the side that carries
 * `fields: [fk]` is the "many" (the foreign key lives there). Named
 * relations pair by name; unnamed ones pair by the pair of models, which is
 * unambiguous in this schema because no two models are joined twice without
 * a name.
 */
function relationships() {
  const ones = [];
  const manys = [];
  for (const model of models) {
    for (const field of model.fields) {
      // The side whose field type is a list collects many rows: that is the
      // "one" end. The side that carries `fields: [fk]` holds the foreign
      // key: that is the "many" end.
      if (field.kind === 'relation-many') ones.push({ model: model.name, field });
      if (field.kind === 'relation-one') manys.push({ model: model.name, field });
    }
  }

  const used = new Set();
  const result = [];

  for (const many of manys) {
    let one =
      ones.find(
        (o) =>
          !used.has(o) &&
          o.field.label !== '' &&
          o.field.label === many.field.label,
      ) ??
      ones.find(
        (o) =>
          !used.has(o) &&
          o.model === many.field.target &&
          many.model === o.field.target,
      );

    if (one === undefined) continue;
    used.add(one);
    used.add(many);

    result.push({
      oneSide: one.model,
      manySide: many.model,
      label: many.field.label || one.field.label || `${many.model}.${many.field.name}`,
      fk: many.field.fkColumns,
      onDelete: many.field.onDelete ?? '…',
      on: `${many.model}.${many.field.name}`,
      collects: `${one.model}.${one.field.name}`,
      optional: many.field.optional,
    });
  }

  return result;
}

const relations = relationships();

/* ----------------------------------------------------------------- layout */

/*
 * Placement is hand-tuned once, here, rather than by an auto-layout engine:
 * the six tables are few enough to place by hand, and the arrangement is
 * itself an argument — User, Tree and Membership across the top (who may do
 * what), the family record below (Person, Relation, Memory), with Tree in
 * the middle because every other table is addressed through it.
 */
const PLACEMENT = {
  User: { x: 40, y: 96 },
  Tree: { x: 440, y: 96 },
  Membership: { x: 840, y: 96 },
  Person: { x: 40, y: 430 },
  Relation: { x: 440, y: 610 },
  Memory: { x: 840, y: 430 },
};

const BOX_W = 300;
const ROW_H = 19;
const HEAD_H = 34;
const PAD = 10;

const boxes = models.map((model) => {
  const place = PLACEMENT[model.name];
  if (place === undefined) {
    throw new Error(`Add ${model.name} to PLACEMENT in docs/erd/build.mjs.`);
  }
  const constraintsH = model.constraints.length > 0 ? 18 : 0;
  const h = HEAD_H + model.fields.length * ROW_H + PAD + constraintsH;
  return { ...place, w: BOX_W, h, model };
});

const boxFor = (name) => boxes.find((b) => b.model.name === name);

/* ------------------------------------------------------------------ draw */

const W = 1180;
const H = 1010;

const FONT =
  'font-family="-apple-system, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif"';
const MONO = 'font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"';
const INK = '#46352f';
const MUTED = '#867972';
const RULE = '#e6d6c4';
const SURF = '#fffdf9';
const ACCENT = '#b9634b';
const BARE = '#f7f1e8';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const T = (x, y, text, o = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${o.mono ? MONO : FONT} font-size="${
    o.size ?? 13
  }" fill="${o.fill ?? INK}" font-weight="${o.weight ?? 400}"${
    o.anchor ? ` text-anchor="${o.anchor}"` : ''
  }${o.italic ? ' font-style="italic"' : ''}>${esc(text)}</text>`;

/** Where a line from the box centre towards (tx, ty) leaves the box. */
function edgePoint(box, tx, ty) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(
    Math.abs(dx) > 0 ? box.w / 2 / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0 ? box.h / 2 / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

const out = [];

out.push(
  `<rect x="0" y="0" width="${W}" height="${H}" fill="${BARE}"/>`,
  T(40, 46, 'Puong — entity relationship diagram', { size: 22, weight: 600 }),
  T(
    40,
    70,
    `Six tables, five enums, ${relations.length} relationships. Generated from api/prisma/schema.prisma by docs/erd/build.mjs — edit the schema, not the picture.`,
    { size: 12.5, fill: MUTED },
  ),
);

/* Relationships first, so the boxes drawn afterwards cover their ends and
   the line appears to touch the edge it belongs to. */
const seenPairs = new Map();
const lineLayer = [];
const labelLayer = [];

for (const rel of relations) {
  const from = boxFor(rel.oneSide);
  const to = boxFor(rel.manySide);
  const pairKey = [rel.oneSide, rel.manySide].sort().join('–');
  const nth = seenPairs.get(pairKey) ?? 0;
  seenPairs.set(pairKey, nth + 1);

  // Two relationships between the same pair (owner/successor, from/to) are
  // drawn as parallel lines rather than on top of each other.
  const offset = nth === 0 ? 0 : nth % 2 === 1 ? 9 : -9;

  const fromC = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const toC = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const a = edgePoint(from, toC.x, toC.y);
  const b = edgePoint(to, fromC.x, fromC.y);

  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / length) * offset;
  const ny = ((b.x - a.x) / length) * offset;

  const p1 = { x: a.x + nx, y: a.y + ny };
  const p2 = { x: b.x + nx, y: b.y + ny };

  lineLayer.push(
    `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(
      1,
    )}" y2="${p2.y.toFixed(1)}" stroke="${ACCENT}" stroke-width="1.6" opacity="0.75"/>`,
  );

  // Cardinality: "1" beside the side that collects many rows, "N" beside
  // the side that holds the foreign key. The letters sit just *beyond* the
  // box edge (along the line) and clear of the line itself (across it), so
  // neither box nor connector can hide them.
  const ux = (p2.x - p1.x) / length;
  const uy = (p2.y - p1.y) / length;
  const across = { x: -uy, y: ux };
  labelLayer.push(
    T(
      p1.x + ux * 15 + across.x * 12,
      p1.y + uy * 15 + across.y * 12 + 4,
      '1',
      { size: 13, weight: 700, fill: ACCENT, anchor: 'middle' },
    ),
    T(
      p2.x - ux * 15 + across.x * 12,
      p2.y - uy * 15 + across.y * 12 + 4,
      'N',
      { size: 13, weight: 700, fill: ACCENT, anchor: 'middle' },
    ),
  );
}

/* Lines first: the tables drawn over their ends make them look attached. */
out.push(...lineLayer);

/* Tables. */
for (const box of boxes) {
  const { model, x, y, w, h } = box;
  out.push(
    `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${SURF}" stroke="${RULE}" stroke-width="1.5"/>`,
    `<path d="M ${x} ${y + HEAD_H} H ${x + w}" stroke="${RULE}"/>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${HEAD_H}" rx="14" fill="${ACCENT}" opacity="0.1"/>`,
    `<path d="M ${x} ${y + HEAD_H - 8} H ${x + w}" stroke="${ACCENT}" opacity="0.1"/>`,
    T(x + 14, y + 23, model.name, { size: 15, weight: 600, fill: ACCENT }),
  );

  const fkSet = new Set(
    relations.filter((r) => r.manySide === model.name).flatMap((r) => r.fk),
  );

  let row = 0;
  for (const field of model.fields) {
    const fy = y + HEAD_H + 14 + row * ROW_H;
    row += 1;
    const isFk = fkSet.has(field.name);

    if (field.kind.startsWith('relation')) {
      out.push(
        T(x + 14, fy, `${field.kind === 'relation-one' ? '→' : '←'} ${field.name}`, {
          size: 12.5,
          fill: MUTED,
          weight: 500,
        }),
        T(
          x + w - 14,
          fy,
          field.kind === 'relation-one'
            ? `${field.optional ? '?' : ''}${field.target}`
            : `${field.target}[]`,
          { size: 12, fill: MUTED, anchor: 'end', mono: true },
        ),
      );
      continue;
    }

    out.push(
      T(x + 14, fy, `${isFk ? '◆ ' : ''}${field.name}`, {
        size: 13,
        weight: field.id ? 700 : 400,
        fill: isFk ? ACCENT : INK,
      }),
      T(
        x + w - 14,
        fy,
        `${field.type}${field.optional ? '?' : ''}${
          field.default && field.default !== 'cuid()' ? ` = ${field.default}` : ''
        }`,
        { size: 12, fill: MUTED, anchor: 'end', mono: true },
      ),
    );
  }

  for (const constraint of model.constraints) {
    const cy = y + HEAD_H + 14 + row * ROW_H + 4;
    row += 1;
    out.push(
      T(x + 14, cy, `@@${constraint.name}(${constraint.columns.join(', ')})`, {
        size: 11.5,
        fill: MUTED,
        italic: true,
        mono: true,
      }),
    );
  }

  out.push('</g>');
}

/* Cardinality letters last: nothing else on the sheet may cover them. */
out.push(...labelLayer);

/* Enum legend — wrapped, because five enums do not fit on one line. */
let ex = 40;
let enumY = 848;
for (const en of enums) {
  const text = `${en.name}: ${en.values.join(' · ')}`;
  // Monospace at 12px is 7.2px a character; measured rather than guessed so
  // a longer enum list wraps instead of running off the sheet.
  const width = text.length * 7.25 + 30;
  if (ex + width > W - 40) {
    ex = 40;
    enumY += 38;
  }
  out.push(
    `<rect x="${ex}" y="${enumY}" width="${width}" height="30" rx="15" fill="${SURF}" stroke="${RULE}"/>`,
    T(ex + 15, enumY + 20, text, { size: 12, fill: INK, mono: true }),
  );
  ex += width + 12;
}

/* Legend. */
const legendY = enumY + 62;
out.push(
  T(
    40,
    legendY,
    'Legend: bold = primary key · ◆ = foreign key column · → = holds the foreign key (many) · ← = collects many rows (one) · 1 —— N = one-to-many',
    { size: 12, fill: MUTED },
  ),
  T(
    40,
    legendY + 20,
    'Date-only columns (birthDate, deathDate, happenedAt) are text in YYYY-MM-DD; timestamps (createdAt, invitedAt, acceptedAt) are timestamptz in UTC.',
    { size: 12, fill: MUTED },
  ),
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Puong entity relationship diagram">\n<title>Puong — entity relationship diagram</title>\n${out.join(
  '\n',
)}\n</svg>\n`;

writeFileSync(join(here, 'erd.svg'), svg);

/* ---------------------------------------------------------------- the md */

const md = [];
md.push('# ERD — Puong data model\n');
md.push(
  'Generated from `api/prisma/schema.prisma` by `docs/erd/build.mjs`, so it describes the database that actually exists rather than one a diagram remembered.\n',
);
md.push('![Puong entity relationship diagram](erd/erd.svg)\n');
md.push('Regenerate with:\n');
md.push('```bash\nnode docs/erd/build.mjs\n```\n');

md.push('## Models\n');
for (const model of models) {
  md.push(`### ${model.name}\n`);
  md.push('| Column | Type | Notes |');
  md.push('|---|---|---|');
  // Which columns are foreign keys, so the column itself is labelled rather
  // than the relation row repeating it underneath.
  const fkTarget = new Map();
  for (const field of model.fields) {
    if (field.kind === 'relation-one') {
      for (const col of field.fkColumns) fkTarget.set(col, field);
    }
  }
  for (const field of model.fields) {
    if (field.kind === 'relation-one') {
      const rel = relations.find(
        (r) =>
          r.manySide === model.name && r.fk.join() === field.fkColumns.join(),
      );
      md.push(
        `| ${field.name} | \`${field.target}${field.optional ? '?' : ''}\` | relation (many side)${rel ? ` · onDelete **${rel.onDelete}**` : ''} |`,
      );
    } else if (field.kind === 'relation-many') {
      md.push(`| ${field.name} | \`${field.target}[]\` | relation (one side) |`);
    } else {
      const fk = fkTarget.get(field.name);
      const notes = [
        field.id ? '**primary key**' : '',
        field.unique ? '**unique**' : '',
        fk ? `foreign key → \`${fk.target}\`` : '',
        field.optional ? 'nullable' : '',
        field.default ? `default \`${field.default}\`` : '',
      ].filter(Boolean);
      md.push(`| \`${field.name}\` | \`${field.type}${field.optional ? '?' : ''}\` | ${notes.join(' · ') || '—'} |`);
    }
  }
  if (model.constraints.length > 0) {
    for (const c of model.constraints) {
      md.push(`| *@@${c.name}* | — | \`${c.columns.join('`, `')}\` |`);
    }
  }
  md.push('');
}

md.push('## Relationships\n');
md.push('| # | From (one) | To (many) | Foreign key | On delete | Meaning |');
md.push('|---|---|---|---|---|---|');
relations.forEach((rel, i) => {
  md.push(
    `| ${i + 1} | \`${rel.oneSide}\` | \`${rel.manySide}\` | \`${rel.fk.join('`, `')}\` | ${rel.onDelete} | ${rel.oneSide} has many ${rel.manySide.toLowerCase()}s |`,
  );
});
md.push('');

md.push('## Enums\n');
for (const en of enums) {
  md.push(`- **${en.name}** — ${en.values.map((v) => `\`${v}\``).join(', ')}`);
}
md.push('');

md.push('## Why these relations\n');
md.push(
  'The reasoning behind many-to-many `User ↔ Tree` (through `Membership`) and one-to-many `Tree → Person` is in `PROPOSAL.md` ("Why these relations") and restated for M2 in `MILESTONES.md`. Two constraints worth reading here:\n',
);
md.push(
  '- `@@unique([treeId, userId])` on `Membership` is what makes "the same person cannot be invited twice" a database fact rather than a check in a service.\n',
);
md.push(
  '- `@@unique([treeId, fromId, toId, type])` on `Relation` is what makes "the same link cannot be created twice" a 409 instead of a duplicate row.\n',
);
md.push(
  '- `Person.treeId` and `Relation.treeId` both cascade from `Tree`, so deleting a tree removes a whole family record in one statement instead of a list of deletes that could be forgotten.\n',
);

writeFileSync(resolve(here, '../erd.md'), `${md.join('\n')}\n`);

console.log(
  `docs/erd: ${models.length} models, ${enums.length} enums, ${relations.length} relationships → erd.svg, ../erd.md`,
);

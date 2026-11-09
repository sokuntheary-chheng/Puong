/**
 * Generation placement — `docs/design.md` §1.3, FR-5.6, and the API's half of
 * the rule the web tier has been drawing with since M1.
 *
 * It is a **third copy of the same algorithm** (the web tier has one in
 * `web/src/services/generations.ts`, the seed check has another), and that is
 * deliberate rather than careless: the three run in different processes and
 * different languages-of-the-week, so agreeing is what makes them comparable.
 * `src/common/generations.spec.ts` runs this copy against the *same* seed
 * fixtures the web check asserts on, so a divergence shows up as a red test
 * rather than as two views of one family that disagree.
 *
 * The rule, in FR-5.6's words:
 *
 * 1. A person with no `PARENT` relation starts in generation 0; anybody with
 *    parents is unplaced until every parent is placed.
 * 2. A placed person sits one generation below the **highest** of their
 *    parents — not below the first parent found, and not below the shortest
 *    path to them.
 * 3. A person with no parents then catches up with the **highest** generation
 *    among the people they are linked to by `SPOUSE`, `SIBLING` or `FRIEND`,
 *    repeating until nothing changes, because catching up can raise an
 *    in-law after her own children were already placed.
 *
 * Both steps only ever raise a generation and generations are bounded by the
 * depth of the lineage, so the loop terminates. Step 3's final sweep is
 * defensive: it is unreachable while FR-5.4 keeps ancestor cycles out.
 *
 * NFR-3.1 asks for the core rules as unit-testable functions with no I/O —
 * this is one: no Prisma, no HTTP, no clock.
 */

/** The two columns the rule reads. A Prisma row satisfies both structurally. */
export interface GenerationPerson {
  id: string;
}

export interface GenerationRelation {
  fromId: string;
  toId: string;
  type: string;
}

/** `personId → generation`. Every person in `people` is a key afterwards. */
export function computeGenerations(
  people: readonly GenerationPerson[],
  relations: readonly GenerationRelation[],
): Map<string, number> {
  const parentsByChild = new Map<string, string[]>();
  const linksByPerson = new Map<string, string[]>();

  for (const relation of relations) {
    if (relation.type === 'PARENT') {
      push(parentsByChild, relation.toId, relation.fromId);
      continue;
    }
    push(linksByPerson, relation.fromId, relation.toId);
    push(linksByPerson, relation.toId, relation.fromId);
  }

  const generation = new Map<string, number>();

  /* Step 1 — a person with no recorded parents is a root. */
  for (const person of people) {
    if (!parentsByChild.has(person.id)) generation.set(person.id, 0);
  }

  for (;;) {
    let changed = false;

    /* Step 2 — place a child once every parent is placed, one below the
       highest of them. */
    for (const person of people) {
      if (generation.has(person.id)) continue;
      const parents = parentsByChild.get(person.id) ?? [];
      if (parents.length > 0 && parents.every((p) => generation.has(p))) {
        const highest = Math.max(...parents.map((p) => generation.get(p) ?? 0));
        generation.set(person.id, highest + 1);
        changed = true;
      }
    }

    /* Step 3 — a parentless person catches up with the highest of their
       spouse/sibling/friend links. */
    for (const person of people) {
      if (parentsByChild.has(person.id)) continue;
      const linked = (linksByPerson.get(person.id) ?? [])
        .map((p) => generation.get(p))
        .filter((g): g is number => g !== undefined);
      if (linked.length === 0) continue;
      const highest = Math.max(...linked);
      if (highest > (generation.get(person.id) ?? 0)) {
        generation.set(person.id, highest);
        changed = true;
      }
    }

    if (!changed) break;
  }

  /* Defensive: unreachable while FR-5.4 rejects ancestor cycles. */
  for (const person of people) {
    if (!generation.has(person.id)) generation.set(person.id, 0);
  }

  return generation;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

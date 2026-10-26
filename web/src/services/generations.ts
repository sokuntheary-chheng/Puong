import type { Person, Relation } from '../types';

/**
 * Generation placement — design.md §1, and FR-5.6.
 *
 * A person with no recorded parents starts at generation 0. Anyone else sits
 * one generation below the highest of their parents. A person with no
 * parents then catches up with the people they are linked to by SPOUSE,
 * SIBLING or FRIEND — and the two steps alternate until neither changes
 * anything, because catching up can raise an in-law after her children were
 * already placed, and those children then have to be placed again.
 *
 * Both steps only ever raise a generation, and generations are bounded by the
 * depth of the lineage, so the loop terminates.
 *
 * Two rules are easy to get wrong here, and both were:
 *
 * - **Take the highest parent, not the shortest path.** A parentless in-law
 *   is herself a root at generation 0. Breadth-first search reaches her
 *   children through her at depth 1 and stops, which puts a grandchild in the
 *   same column as his own father.
 * - **Take the highest connection, not the first.** Someone married into
 *   generation 2 who is also a friend of the founder must not appear above
 *   their own spouse.
 *
 * NFR-3.1 asks for this as a pure function, which it is: no Vue, no store,
 * no I/O.
 */
export function computeGenerations(
  people: readonly Person[],
  relations: readonly Relation[],
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

  /* Step 1 — initialise. */
  for (const person of people) {
    if (!parentsByChild.has(person.id)) generation.set(person.id, 0);
  }

  for (;;) {
    let changed = false;

    /* Step 2(a) — place, once every parent is placed. */
    for (const person of people) {
      if (generation.has(person.id)) continue;
      const parents = parentsByChild.get(person.id) ?? [];
      if (parents.length > 0 && parents.every((p) => generation.has(p))) {
        const highest = Math.max(...parents.map((p) => generation.get(p) ?? 0));
        generation.set(person.id, highest + 1);
        changed = true;
      }
    }

    /* Step 2(b) — a parentless person catches up. */
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

  /* Step 3 — defensive. Unreachable while FR-5.4 rejects ancestor cycles. */
  for (const person of people) {
    if (!generation.has(person.id)) generation.set(person.id, 0);
  }

  return generation;
}

/**
 * Group a tree's people into generation columns, oldest first.
 *
 * Within a column people keep their original order rather than being sorted
 * by name, so that the same tree always draws the same way.
 */
export function groupByGeneration(
  people: readonly Person[],
  relations: readonly Relation[],
): Array<{ generation: number; people: Person[] }> {
  const generation = computeGenerations(people, relations);

  const columns = new Map<number, Person[]>();
  for (const person of people) {
    const g = generation.get(person.id) ?? 0;
    const column = columns.get(g);
    if (column) column.push(person);
    else columns.set(g, [person]);
  }

  return [...columns.entries()]
    .sort(([a], [b]) => a - b)
    .map(([g, members]) => ({ generation: g, people: members }));
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

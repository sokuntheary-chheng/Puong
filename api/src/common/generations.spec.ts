import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeGenerations } from './generations';

/**
 * FR-5.6 / NFR-3.1 — the generation rule, as a unit test with no database.
 *
 * The first block runs this copy of the algorithm against **the same seed
 * fixtures `web/scripts/check-generations.mjs` asserts on**, with the same
 * expected columns. That is the point: the web tier and the API each carry
 * their own implementation (they run in different processes, and the API's
 * one exists so the `generation=` filter of FR-7.2 cannot disagree with the
 * column the tree draws). If either copy drifts, one of the two suites goes
 * red — which is the only way three implementations of one rule stay honest.
 */
describe('computeGenerations (FR-5.6)', () => {
  interface SeedPerson {
    id: string;
    treeId: string;
  }
  interface SeedRelation {
    id: string;
    treeId: string;
    fromId: string;
    toId: string;
    type: string;
  }

  const db = JSON.parse(
    readFileSync(resolve(__dirname, '../../../web/src/mock/db.json'), 'utf8'),
  ) as { people: SeedPerson[]; relations: SeedRelation[] };

  const t1People = db.people.filter((p) => p.treeId === 't1');
  const t1Relations = db.relations.filter((r) => r.treeId === 't1');

  /* The layout `web/scripts/check-generations.mjs` proves the seed claims. */
  const expected: Record<number, string[]> = {
    0: ['p01', 'p02', 'p23'],
    1: ['p03', 'p04', 'p05', 'p06', 'p07', 'p08'],
    2: ['p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17'],
    3: ['p18', 'p19', 'p20', 'p21', 'p22'],
  };

  it('places the seed family exactly where the web tier places it', () => {
    const generation = computeGenerations(t1People, t1Relations);

    const actual: Record<number, string[]> = {};
    for (const [id, g] of generation) {
      (actual[g] ??= []).push(id);
    }
    for (const key of Object.keys(actual)) {
      actual[Number(key)].sort();
    }

    expect(actual).toEqual(expected);
  });

  it('puts every person in exactly one generation', () => {
    const generation = computeGenerations(t1People, t1Relations);
    expect(generation.size).toBe(t1People.length);
  });

  it('leaves no parent in the same generation as, or below, their child', () => {
    const generation = computeGenerations(t1People, t1Relations);
    for (const relation of t1Relations) {
      if (relation.type !== 'PARENT') continue;
      const parent = generation.get(relation.fromId);
      const child = generation.get(relation.toId);
      expect(parent).toBeDefined();
      expect(child).toBeDefined();
      expect(parent as number).toBeLessThan(child as number);
    }
  });

  it('takes the HIGHEST parent, not the first one found', () => {
    /* `d` has two parents: `b` (generation 1) and `c` (generation 2). The
       child belongs one below the *highest* — taking the first parent found
       would put `d` beside `c` instead of below her, and the two halves of
       the family would be drawn as siblings. */
    const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const relations = [
      { fromId: 'a', toId: 'b', type: 'PARENT' },
      { fromId: 'a', toId: 'c', type: 'PARENT' },
      { fromId: 'b', toId: 'c', type: 'PARENT' },
      { fromId: 'b', toId: 'd', type: 'PARENT' },
      { fromId: 'c', toId: 'd', type: 'PARENT' },
    ];

    const generation = computeGenerations(people, relations);
    expect(generation.get('a')).toBe(0);
    expect(generation.get('b')).toBe(1);
    expect(generation.get('c')).toBe(2);
    expect(generation.get('d')).toBe(3);
  });

  it('lets a parentless in-law catch up with her spouse', () => {
    /* `wife` has no PARENT relation of her own, so a first-touch search
       would leave her at 0 while her husband sits at 2 — and the couple
       would be drawn in different columns, with their children (if any)
       beside their own mother. FR-5.6's step 3 exists for exactly this, and
       it must be repeated: raising her can raise whoever she is linked to
       next. */
    const people = [
      { id: 'founder' },
      { id: 'child' },
      { id: 'husband' },
      { id: 'wife' },
    ];
    const relations = [
      { fromId: 'founder', toId: 'child', type: 'PARENT' },
      { fromId: 'child', toId: 'husband', type: 'PARENT' },
      { fromId: 'husband', toId: 'wife', type: 'SPOUSE' },
    ];

    const generation = computeGenerations(people, relations);
    expect(generation.get('husband')).toBe(2);
    expect(generation.get('wife')).toBe(generation.get('husband'));
    expect(generation.get('wife')).toBe(2);
  });

  it('terminates and still numbers everybody when the data loops anyway', () => {
    /* FR-5.4 refuses to write such a loop, so this is unreachable through
       the API — and the function still answers instead of hanging, which is
       the difference between a defensive step and a comment. */
    const people = [{ id: 'a' }, { id: 'b' }];
    const relations = [
      { fromId: 'a', toId: 'b', type: 'PARENT' },
      { fromId: 'b', toId: 'a', type: 'PARENT' },
    ];

    const generation = computeGenerations(people, relations);
    expect(generation.size).toBe(2);
    expect(generation.get('a')).toBeDefined();
    expect(generation.get('b')).toBeDefined();
  });
});

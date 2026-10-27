import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  createRelation,
  deleteRelation,
  getMyRole,
  getTree,
  listPeople,
  listRelations,
} from '../services/api';
import { groupByGeneration } from '../services/generations';
import type { Membership, Person, Relation, Tree } from '../types';
import { useSessionStore } from './session';
import { createAsync, run } from './asyncState';
import type { AsyncState } from './asyncState';

/**
 * The tree that is currently open.
 *
 * The four requests are issued together rather than in sequence: they are
 * independent, and waiting for each one before starting the next would make
 * the tree view take four round trips to render.
 *
 * Everything a view needs to derive from people and relations is derived
 * here, once, rather than being recomputed in every component that wants it.
 */
export const useTreeStore = defineStore('openTree', () => {
  const session = useSessionStore();

  const tree = createAsync<Tree | null>(null);
  const people = createAsync<Person[]>([]);
  const relations = createAsync<Relation[]>([]);
  const role = createAsync<Membership | null>(null);

  /** Which tree these four belong to, so a stale result is recognisable. */
  const loadedTreeId = ref('');

  async function open(treeId: string): Promise<void> {
    loadedTreeId.value = treeId;
    await Promise.all([
      run(tree, () => getTree(treeId)),
      run(people, () => listPeople(treeId)),
      run(relations, () => listRelations(treeId)),
      /* No session, no role to ask about — and asking the API for "the role
         of nobody in this tree" would be a request it has no answer to. */
      run(role, () =>
        session.currentUserId === ''
          ? Promise.resolve(null)
          : getMyRole(treeId, session.currentUserId),
      ),
    ]);
  }

  /**
   * One status for the whole tree.
   *
   * The four requests run in parallel, so they finish at slightly different
   * times. A view that rendered on `tree` alone would draw the heading
   * while the people were still arriving and the canvas would pop in
   * behind it; this folds the four into the single state a view should
   * wait on, preferring an error over a spinner so a failure is never
   * hidden behind "Loading…".
   */
  const loadState = computed<AsyncState<null>>(() => {
    const states = [tree, people, relations, role];

    const failed = states.find((s) => s.status === 'error');
    if (failed) {
      return { status: 'error', data: null, error: failed.error };
    }

    const pending = states.some((s) => s.status === 'idle' || s.status === 'loading');
    if (pending) {
      return { status: 'loading', data: null, error: null };
    }

    return { status: 'ready', data: null, error: null };
  });

  /**
   * The role is the one request here that belongs to the *viewer* rather
   * than to the tree, so it is the one that has to be redone when the
   * identity changes. The tree, its people and its relations do not: they
   * are the same for everybody.
   *
   * Signing out drops the role instead of refetching it: there is no
   * account to ask about, and a role left on screen would keep drawing
   * controls for somebody who is no longer here.
   */
  watch(
    () => session.currentUserId,
    async () => {
      if (loadedTreeId.value === '') return;

      if (session.currentUserId === '') {
        role.data = null;
        role.status = 'idle';
        role.error = null;
        return;
      }

      await run(role, () => getMyRole(loadedTreeId.value, session.currentUserId));
    },
  );

  /* ---------------------------------------------------------------- */
  /* Derived from the loaded data                                     */
  /* ---------------------------------------------------------------- */

  /** Oldest generation first — the order the canvas draws its columns in. */
  const generations = computed(() =>
    groupByGeneration(people.data, relations.data),
  );

  const personById = computed(() => {
    const index = new Map<string, Person>();
    for (const person of people.data) index.set(person.id, person);
    return index;
  });

  function find(personId: string): Person | undefined {
    return personById.value.get(personId);
  }

  /** Resolve ids to people, dropping unknown ids and self-links. */
  function toPeople(ids: string[], selfId: string): Person[] {
    const seen = new Set<string>();
    const result: Person[] = [];
    for (const id of ids) {
      if (id === selfId || seen.has(id)) continue;
      const person = personById.value.get(id);
      if (person) {
        seen.add(id);
        result.push(person);
      }
    }
    return result;
  }

  /**
   * PARENT is the only directed relation: `from` is the parent and `to` is
   * the child, in every case, so the two ends mean different things and
   * each query matches one side.
   */
  function parentsOf(personId: string): Person[] {
    return toPeople(
      relations.data
        .filter((r) => r.type === 'PARENT' && r.toId === personId)
        .map((r) => r.fromId),
      personId,
    );
  }

  function childrenOf(personId: string): Person[] {
    return toPeople(
      relations.data
        .filter((r) => r.type === 'PARENT' && r.fromId === personId)
        .map((r) => r.toId),
      personId,
    );
  }

  /**
   * SPOUSE, SIBLING and FRIEND are symmetric: the record `p03 — SIBLING →
   * p05` means the same thing as `p05 — SIBLING → p03`, so a lookup must
   * match either end or half the family goes missing from the person page.
   */
  function linked(
    personId: string,
    type: 'SPOUSE' | 'SIBLING' | 'FRIEND',
  ): Person[] {
    const ids: string[] = [];
    for (const relation of relations.data) {
      if (relation.type !== type) continue;
      if (relation.fromId === personId) ids.push(relation.toId);
      else if (relation.toId === personId) ids.push(relation.fromId);
    }
    return toPeople(ids, personId);
  }

  const spousesOf = (id: string): Person[] => linked(id, 'SPOUSE');
  const siblingsOf = (id: string): Person[] => linked(id, 'SIBLING');
  const friendsOf = (id: string): Person[] => linked(id, 'FRIEND');

  /**
   * FR-8.3 — the two paths the canvas highlights.
   *
   * Walking `PARENT` edges only: a spouse is not an ancestor and a sibling
   * is not a descendant, however obvious that is to a reader. The visited
   * set is what makes the walk safe without the API's cycle check — a
   * database a person edited by hand could still contain a loop, and an
   * infinite loop here would freeze the page rather than return a wrong
   * answer.
   */
  function ancestorsOf(personId: string): Set<string> {
    const found = new Set<string>();
    const queue = parentsOf(personId).map((person) => person.id);
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (found.has(id)) continue;
      found.add(id);
      for (const parent of parentsOf(id)) queue.push(parent.id);
    }
    return found;
  }

  function descendantsOf(personId: string): Set<string> {
    const found = new Set<string>();
    const queue = childrenOf(personId).map((person) => person.id);
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (found.has(id)) continue;
      found.add(id);
      for (const child of childrenOf(id)) queue.push(child.id);
    }
    return found;
  }

  /** Everyone a person is linked to, grouped, for the person page. */
  function familyOf(personId: string): Array<{ label: string; people: Person[] }> {
    return [
      { label: 'Parents', people: parentsOf(personId) },
      { label: 'Spouse', people: spousesOf(personId) },
      { label: 'Siblings', people: siblingsOf(personId) },
      { label: 'Children', people: childrenOf(personId) },
      { label: 'Friends', people: friendsOf(personId) },
    ].filter((group) => group.people.length > 0);
  }

  /** The signed-in member's role in this tree, or null when not a member. */
  const myRole = computed(() => role.data?.role ?? null);

  /** FR-3.6 — only an owner or a contributor may write. */
  const canWrite = computed(
    () => myRole.value === 'OWNER' || myRole.value === 'CONTRIBUTOR',
  );

  /* ---------------------------------------------------------------- */
  /* Keeping the loaded lists true after a write                      */
  /* ---------------------------------------------------------------- */

  /**
   * Put one person into the loaded list — as a new card, or as the edited
   * version of an existing one.
   *
   * The list is updated rather than refetched because a whole-tree reload
   * after every keystroke-saved edit would redraw the canvas and throw away
   * the selection. Everything *derived* from people (the generation
   * columns, the family groups) is a computed over this array, so it
   * follows on its own.
   */
  function putPerson(person: Person): void {
    const known = people.data.some((row) => row.id === person.id);
    people.data = known
      ? people.data.map((row) => (row.id === person.id ? person : row))
      : [...people.data, person];
  }

  /**
   * Take one person out — FR-4.6 removes them from the tree entirely, and
   * their relations go with them server-side, so dropping the relations
   * here too is not an extra rule but the same one reflected.
   */
  function dropPerson(personId: string): void {
    people.data = people.data.filter((row) => row.id !== personId);
    relations.data = relations.data.filter(
      (row) => row.fromId !== personId && row.toId !== personId,
    );
  }

  /** FR-5.1 — write a link and show it at once. */
  async function link(input: {
    fromId: string;
    toId: string;
    type: Relation['type'];
  }): Promise<Relation> {
    const created = await createRelation(loadedTreeId.value, input);
    relations.data = [...relations.data, created];
    return created;
  }

  /** FR-5.5 — unlink, and let the generation columns recompute. */
  async function unlink(relationId: string): Promise<void> {
    await deleteRelation(loadedTreeId.value, relationId);
    relations.data = relations.data.filter((row) => row.id !== relationId);
  }

  return {
    tree,
    people,
    relations,
    role,
    loadedTreeId,
    open,
    loadState,
    generations,
    personById,
    find,
    familyOf,
    parentsOf,
    childrenOf,
    spousesOf,
    siblingsOf,
    friendsOf,
    ancestorsOf,
    descendantsOf,
    myRole,
    canWrite,
    putPerson,
    dropPerson,
    link,
    unlink,
  };
});

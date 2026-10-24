import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getMyRole, getTree, listPeople, listRelations } from '../services/mockApi';
import { groupByGeneration } from '../services/generations';
import type { Membership, Person, Relation, Tree } from '../mock/types';
import { useSessionStore } from './session';
import { createAsync, run } from './asyncState';

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
      run(role, () => getMyRole(treeId, session.currentUserId)),
    ]);
  }

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

  return {
    tree,
    people,
    relations,
    role,
    loadedTreeId,
    open,
    generations,
    personById,
    find,
    familyOf,
    parentsOf,
    childrenOf,
    spousesOf,
    siblingsOf,
    friendsOf,
    myRole,
    canWrite,
  };
});

/**
 * The persisted model, as specified in docs/SRS.md §3.3.
 *
 * These types describe `src/mock/db.json`. The same shapes become the Prisma
 * models at M2, so the field names are chosen to match the specification
 * exactly rather than to suit the mock.
 */

/** FR-3.6 — the role a member holds in one tree. Scoped per tree, never per account. */
export type Role = 'OWNER' | 'CONTRIBUTOR' | 'VIEWER';

/** FR-3.2 / FR-3.3 / FR-3.5 */
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'REVOKED';

/** FR-5.1 */
export type RelationType = 'PARENT' | 'SPOUSE' | 'FRIEND' | 'SIBLING';

/** FR-6.6 */
export type MemoryVisibility = 'PRIVATE' | 'TREE';

export interface User {
  id: string;
  email: string;
  /**
   * Not a real hash. Authentication is M3; the mock layer never reads this
   * value, and it is deliberately not shaped like a bcrypt digest so that it
   * cannot be mistaken for one in Git.
   */
  passwordHash: string;
  displayName: string;
  createdAt: string;
}

export interface Tree {
  id: string;
  name: string;
  description: string;
  coverPhotoUrl: string | null;
  ownerId: string;
  /** FR-9.1 — null until an owner nominates a successor. */
  successorId: string | null;
  createdAt: string;
}

export interface Membership {
  id: string;
  treeId: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
  invitedAt: string | null;
  acceptedAt: string | null;
}

export interface Person {
  id: string;
  treeId: string;
  fullName: string;
  nickname: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  birthDate: string | null;
  deathDate: string | null;
  isLiving: boolean;
  photoUrl: string | null;
  bio: string | null;
  createdById: string;
  createdAt: string;
}

export interface Relation {
  id: string;
  treeId: string;
  fromId: string;
  toId: string;
  type: RelationType;
}

export interface Memory {
  id: string;
  treeId: string;
  personId: string;
  authorId: string;
  title: string;
  body: string;
  happenedAt: string | null;
  photoUrl: string | null;
  visibility: MemoryVisibility;
  createdAt: string;
}

/** The whole persisted model — six tables, as specified. */
export interface Database {
  users: User[];
  trees: Tree[];
  memberships: Membership[];
  people: Person[];
  relations: Relation[];
  memories: Memory[];
}

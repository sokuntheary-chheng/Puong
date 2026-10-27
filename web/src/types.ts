/**
 * The persisted model, as specified in docs/SRS.md §3.3.
 *
 * These are the shapes the API returns — `docs/api.md` is the contract, and
 * the DTOs under `api/src` generate it. They started life describing the
 * M1 mock's `src/mock/db.json`, which is still the seed dataset the API is
 * loaded from, and that is why the field names match the specification
 * exactly rather than the transport.
 *
 * **There is no `passwordHash` here.** A digest never leaves the server: the
 * DTO that answers `/auth/me` and `/users` has no such field, so the type
 * cannot claim one.
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
  displayName: string;
  createdAt: string;
}

export interface Tree {
  id: string;
  name: string;
  description: string | null;
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

/**
 * FR-3.2 — one invitation waiting for my answer, as the home page renders it.
 *
 * `membershipId` rather than `id`: this row *is* a membership, but what the
 * banner acts on is the invitation inside it, and the API names it that way
 * so the two are never confused with a membership that is already ACTIVE.
 */
export interface Invitation {
  membershipId: string;
  treeId: string;
  treeName: string;
  treeDescription: string | null;
  invitedBy: string;
  role: Role;
  invitedAt: string;
  /** FR-3.4 — `invitedAt` plus seven days, derived by the server. */
  expiresAt: string;
}

/**
 * FR-9.1 / FR-9.3 — the succession state of one tree.
 *
 * Nothing here is optional: "no successor" is `successorId: null`, not a
 * missing field, so one shape renders both states and a page never has to
 * distinguish a 404 from an empty nomination.
 */
export interface SuccessorInfo {
  treeId: string;
  successorId: string | null;
  successorName: string | null;
  nominatedAt: string | null;
  ownerId: string;
  ownerName: string;
  ownershipTransferredAt: string | null;
  previousOwnerId: string | null;
}

/** FR-9.1 — one pending nomination, offered to the nominee's home page. */
export interface Successorship {
  treeId: string;
  treeName: string;
  ownerId: string;
  ownerName: string;
  nominatedAt: string;
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

/**
 * Seed the database with exactly the data the M1 prototype shipped with.
 *
 * The source is `web/src/mock/db.json`, read rather than copied: one file
 * describing the family, consumed by the mock in M1 and by PostgreSQL from
 * M2 onward. Duplicating it here would give the two implementations a place
 * to disagree, and the whole point of matching the mock is that swapping it
 * out (M3) changes the transport and nothing else.
 *
 * The one thing that genuinely changes is the password: the mock carries a
 * placeholder string that is deliberately not a hash, while a real database
 * must never hold a password in any other form than a bcrypt digest. Every
 * seeded account therefore gets the same known password, `Passw0rd!`, which
 * is written down here and in `docs/api.md` because a seed that invents a
 * secret nobody knows is a seed that produces an app nobody can log into.
 *
 * Run with `npm run seed` (or `npx prisma db seed`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, type MembershipStatus, type Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/** The password every seeded account accepts. Development data only. */
export const SEED_PASSWORD = 'Passw0rd!';

/** Cost 10 — the same number `UsersService` uses, so hashes compare alike. */
const BCRYPT_ROUNDS = 10;

interface SeedUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

interface SeedTree {
  id: string;
  name: string;
  description: string | null;
  coverPhotoUrl: string | null;
  ownerId: string;
  successorId: string | null;
  createdAt: string;
}

interface SeedMembership {
  id: string;
  treeId: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
  invitedAt: string | null;
  acceptedAt: string | null;
}

interface SeedPerson {
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

interface SeedRelation {
  id: string;
  treeId: string;
  fromId: string;
  toId: string;
  type: 'PARENT' | 'SPOUSE' | 'FRIEND' | 'SIBLING';
}

interface SeedMemory {
  id: string;
  treeId: string;
  personId: string;
  authorId: string;
  title: string;
  body: string;
  happenedAt: string | null;
  photoUrl: string | null;
  visibility: 'PRIVATE' | 'TREE';
  createdAt: string;
}

interface SeedDatabase {
  users: SeedUser[];
  trees: SeedTree[];
  memberships: SeedMembership[];
  people: SeedPerson[];
  relations: SeedRelation[];
  memories: SeedMemory[];
}

function loadMock(): SeedDatabase {
  const path = resolve(__dirname, '../../web/src/mock/db.json');
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as SeedDatabase;

  const missing = (
    [
      'users',
      'trees',
      'memberships',
      'people',
      'relations',
      'memories',
    ] as const
  ).filter((key) => !Array.isArray(parsed[key]));
  if (missing.length > 0) {
    throw new Error(
      `The mock at ${path} is missing: ${missing.join(', ')}. The seed reads the prototype's own data rather than a copy of it, so it has to be complete.`,
    );
  }
  return parsed;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const db = loadMock();

  try {
    // The password first, because it is the only value the mock does not
    // already carry: hashing three of them takes ~300ms and nothing else
    // needs to wait on it.
    const hashes = new Map<string, string>();
    for (const user of db.users) {
      hashes.set(user.id, await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS));
    }

    // Wipe in reverse dependency order. Every relation in the schema is
    // `Cascade` from Tree downward, so deleting the trees alone would empty
    // the rest — but `deleteMany` on the parents first keeps the script
    // correct even if a cascade is later changed to `Restrict`.
    await prisma.$transaction([
      prisma.memory.deleteMany(),
      prisma.relation.deleteMany(),
      prisma.person.deleteMany(),
      prisma.membership.deleteMany(),
      prisma.tree.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    await prisma.user.createMany({
      data: db.users.map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        // The mock's value is a placeholder, not a hash — replaced here so
        // that no digest-shaped string in the database is a lie.
        passwordHash: hashes.get(user.id) as string,
        createdAt: new Date(user.createdAt),
      })),
    });

    await prisma.tree.createMany({
      data: db.trees.map((tree) => ({
        ...tree,
        createdAt: new Date(tree.createdAt),
      })),
    });

    await prisma.membership.createMany({
      data: db.memberships.map((membership) => ({
        ...membership,
        invitedAt:
          membership.invitedAt === null ? null : new Date(membership.invitedAt),
        acceptedAt:
          membership.acceptedAt === null
            ? null
            : new Date(membership.acceptedAt),
      })),
    });

    await prisma.person.createMany({
      data: db.people.map((person) => ({
        ...person,
        createdAt: new Date(person.createdAt),
      })),
    });

    await prisma.relation.createMany({ data: db.relations });

    await prisma.memory.createMany({
      data: db.memories.map((memory) => ({
        ...memory,
        createdAt: new Date(memory.createdAt),
      })),
    });

    const counts = await Promise.all([
      prisma.user.count(),
      prisma.tree.count(),
      prisma.membership.count(),
      prisma.person.count(),
      prisma.relation.count(),
      prisma.memory.count(),
    ]);

    console.log('Seeded Puong from web/src/mock/db.json:');
    console.log(
      `  users ${counts[0]} · trees ${counts[1]} · memberships ${counts[2]} · ` +
        `people ${counts[3]} · relations ${counts[4]} · memories ${counts[5]}`,
    );
    console.log(`  every account signs in with: ${SEED_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();

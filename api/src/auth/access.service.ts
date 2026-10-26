import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * How much a role is worth, for "at least CONTRIBUTOR" comparisons.
 *
 * The numbers are the only ordering of `Role` in the codebase: writing it
 * once here means a guard cannot compare `role >= 'OWNER'` as strings and
 * quietly get a different answer than the matrix in docs/design.md §2.1.
 */
const RANK: Record<Role, number> = {
  VIEWER: 1,
  CONTRIBUTOR: 2,
  OWNER: 3,
};

export const rank = (role: Role): number => RANK[role];

/**
 * Membership, read the way the guards read it.
 *
 * Two rules that must not drift, and are therefore implemented once:
 *
 * - **A role exists only inside an ACTIVE membership** in one tree. An
 *   invitation that has not been accepted (FR-2.3) and a revoked membership
 *   both count as "not a member".
 * - **A caller who is not a member of a tree is told 404, not 403** (FR-2.5,
 *   FR-2.3): a 403 would confirm that the tree exists, which is the answer
 *   the URL is guessing at. 403 is for a member who is asking for more than
 *   their role allows — that they are a member is already public to them.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The caller's role in a tree, or null when they are not a member. */
  async roleIn(treeId: string, userId: string): Promise<Role | null> {
    const membership = await this.prisma.membership.findFirst({
      where: { treeId, userId, status: 'ACTIVE' },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  /**
   * Asserts "a member of this tree, with at least this role", returning the
   * role so a caller can carry on without reading it twice.
   */
  async assertRole(
    treeId: string,
    userId: string,
    minimum: Role,
  ): Promise<Role> {
    const role = await this.roleIn(treeId, userId);
    if (role === null) throw this.notAMember(treeId);
    if (rank(role) < rank(minimum)) throw this.insufficient(role, minimum);
    return role;
  }

  notAMember(treeId: string): NotFoundException {
    return new NotFoundException(`tree ${treeId} was not found.`);
  }

  insufficient(role: Role, minimum: Role): ForbiddenException {
    return new ForbiddenException(
      `This action needs the ${minimum} role in this tree; your role is ${role}.`,
    );
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { AccessService } from '../auth/access.service';
import { assertSomeField } from '../common/assert-some-field';
import { isMissingRecord } from '../common/is-missing-record';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMembershipDto,
  MembershipDto,
  UpdateMembershipDto,
} from './dto/memberships.dto';

/**
 * Membership writes are the one place where "who is asking" is decided from
 * a row rather than from the path: `/memberships/:id` does not name a tree,
 * so the tree is read from the membership itself and the caller's OWNER
 * role *there* is what is checked. The role guard cannot do it — it only
 * ever sees path parameters — which is why this service owns the check.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /**
   * Every membership of one tree — the member list an owner curates.
   *
   * Ordered by role then account so the list reads owner → contributor →
   * viewer, which is the order somebody editing permissions thinks in.
   * Invited memberships are included: an owner needs to see who has not
   * answered yet.
   */
  async list(treeId: string): Promise<MembershipDto[]> {
    await this.assertTree(treeId);
    return this.prisma.membership.findMany({
      where: { treeId },
      orderBy: [{ role: 'asc' }, { userId: 'asc' }],
    });
  }

  /**
   * One account's membership in one tree — the endpoint the frontend calls
   * to answer "what may I do here?".
   *
   * Whatever the status, deliberately: the caller has to look at `status`
   * itself, because an INVITED membership and an ACTIVE one mean different
   * things (FR-3.5) and hiding that in the endpoint would hide it from the
   * UI too. A missing membership is 404, not 200-with-null — a null body is
   * not a thing this API returns.
   */
  async forUser(treeId: string, userId: string): Promise<MembershipDto> {
    await this.assertTree(treeId);

    const membership = await this.prisma.membership.findUnique({
      where: { treeId_userId: { treeId, userId } },
    });
    if (membership === null) {
      throw new NotFoundException(
        `user ${userId} is not a member of tree ${treeId}.`,
      );
    }
    return membership;
  }

  /**
   * Adds (usually: invites) a member.
   *
   * The timestamps follow the status rather than being sent by the client:
   * an invitation is recorded when it is made and an acceptance when it
   * happens, so a caller cannot backdate either. A repeat of the same
   * (tree, user) pair is the unique index's `P2002`, which the filter turns
   * into 409 — "already a member" rather than a duplicate row.
   */
  async create(
    treeId: string,
    dto: CreateMembershipDto,
  ): Promise<MembershipDto> {
    await this.assertTree(treeId);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });
    if (user === null) {
      throw new NotFoundException(`user ${dto.userId} was not found.`);
    }

    const status = dto.status ?? MembershipStatus.INVITED;
    const now = new Date();

    return this.prisma.membership.create({
      data: {
        treeId,
        userId: dto.userId,
        role: dto.role,
        status,
        invitedAt: status === MembershipStatus.ACTIVE ? null : now,
        acceptedAt: status === MembershipStatus.ACTIVE ? now : null,
      },
    });
  }

  /**
   * Changes a membership: role, status, or both.
   *
   * Three callers can reach this row, and each may do less:
   *
   * - **The owner of that tree** — anything.
   * - **The member themselves** — their own `status` only: accepting or
   *   declining an invitation (FR-3.5) is the one membership change a
   *   non-owner makes, and letting them also send `role` would be a way to
   *   promote yourself by editing your own row.
   * - **Anybody else** — 403, after a 404 if they are not a member at all.
   *
   * The last-owner rule lives here too: a tree with no ACTIVE OWNER cannot
   * be repaired through this API (only an owner may invite), so removing or
   * demoting the final one is refused rather than left for somebody to
   * discover later.
   */
  async update(
    id: string,
    dto: UpdateMembershipDto,
    actorId: string,
  ): Promise<MembershipDto> {
    assertSomeField(dto);

    const current = await this.prisma.membership.findUnique({ where: { id } });
    if (current === null) {
      throw new NotFoundException(`membership ${id} was not found.`);
    }

    const ownRow = current.userId === actorId;
    if (ownRow) {
      if (dto.role !== undefined) {
        throw new ForbiddenException(
          'Only an owner of this tree can change a role.',
        );
      }
    } else {
      await this.access.assertRole(current.treeId, actorId, 'OWNER');
    }

    const losesOwner =
      current.role === 'OWNER' &&
      current.status === MembershipStatus.ACTIVE &&
      ((dto.role !== undefined && dto.role !== 'OWNER') ||
        (dto.status !== undefined && dto.status !== MembershipStatus.ACTIVE));
    if (losesOwner) await this.assertNotLastOwner(current.treeId, current.id);

    const now = new Date();
    const acceptsNow =
      dto.status === MembershipStatus.ACTIVE &&
      current.acceptedAt === null &&
      current.status !== MembershipStatus.ACTIVE;

    try {
      return await this.prisma.membership.update({
        where: { id },
        data: {
          role: dto.role,
          status: dto.status,
          acceptedAt: acceptsNow ? now : undefined,
        },
      });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(`membership ${id} was not found.`);
      }
      throw error;
    }
  }

  /**
   * Removes a membership — an invitation declined, a member removed, or you
   * leaving (FR-3.5).
   *
   * The owner check is against the tree *of this row*, read here rather than
   * from a path parameter; leaving a tree yourself is the exception, which
   * is what "decline an invitation" means for the person invited.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const current = await this.prisma.membership.findUnique({ where: { id } });
    if (current === null) {
      throw new NotFoundException(`membership ${id} was not found.`);
    }

    if (current.userId !== actorId) {
      await this.access.assertRole(current.treeId, actorId, 'OWNER');
    }

    if (
      current.role === 'OWNER' &&
      current.status === MembershipStatus.ACTIVE
    ) {
      await this.assertNotLastOwner(current.treeId, current.id);
    }

    try {
      await this.prisma.membership.delete({ where: { id } });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(`membership ${id} was not found.`);
      }
      throw error;
    }
  }

  /** Refuses to leave a tree with nobody who can administer it. */
  private async assertNotLastOwner(
    treeId: string,
    membershipId: string,
  ): Promise<void> {
    const others = await this.prisma.membership.count({
      where: {
        treeId,
        role: 'OWNER',
        status: MembershipStatus.ACTIVE,
        id: { not: membershipId },
      },
    });
    if (others === 0) {
      throw new ConflictException(
        'This is the tree’s last owner: promote somebody else first, or the tree could not be administered again.',
      );
    }
  }

  private async assertTree(treeId: string): Promise<void> {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });
    if (tree === null)
      throw new NotFoundException(`tree ${treeId} was not found.`);
  }
}

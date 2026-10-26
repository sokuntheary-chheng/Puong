import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { assertSomeField } from '../common/assert-some-field';
import { isMissingRecord } from '../common/is-missing-record';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMembershipDto,
  MembershipDto,
  UpdateMembershipDto,
} from './dto/memberships.dto';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async update(id: string, dto: UpdateMembershipDto): Promise<MembershipDto> {
    assertSomeField(dto);

    const current = await this.prisma.membership.findUnique({ where: { id } });
    if (current === null) {
      throw new NotFoundException(`membership ${id} was not found.`);
    }

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
   * Removes a membership — an invitation declined, or a member removed.
   *
   * There is no guard here that the last OWNER cannot be removed: that rule
   * belongs with ownership transfer (story 10) and the authentication of M3,
   * where "who is asking" finally exists. Enforcing it without knowing the
   * caller would enforce it against everyone.
   */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.membership.delete({ where: { id } });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(`membership ${id} was not found.`);
      }
      throw error;
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

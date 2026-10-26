import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertSomeField } from '../common/assert-some-field';
import { isMissingRecord } from '../common/is-missing-record';
import { text } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTreeDto, TreeDto, UpdateTreeDto } from './dto/trees.dto';

@Injectable()
export class TreesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FR-1.2 / FR-1.3 — the trees a member sees.
   *
   * Filtered by an **ACTIVE** membership in the query: an invitation that
   * has not been accepted (FR-3.5) must not put a tree into anyone's list,
   * and filtering in the query rather than in the view is what keeps that
   * rule in one place.
   *
   * The account is always the caller's (`AuthGuard`), never a parameter —
   * M2 accepted `?memberId=` because there was no session to read, and that
   * was an open invitation to ask for somebody else's list.
   */
  list(memberId: string): Promise<TreeDto[]> {
    return this.prisma.tree.findMany({
      where: {
        memberships: { some: { userId: memberId, status: 'ACTIVE' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(id: string): Promise<TreeDto> {
    const tree = await this.prisma.tree.findUnique({ where: { id } });
    if (tree === null) throw new NotFoundException(`tree ${id} was not found.`);
    return tree;
  }

  /**
   * Creates the tree and its OWNER membership in one transaction.
   *
   * Two writes, one transaction: if the membership failed the tree would have
   * to be rolled back by hand, and a tree with no owner cannot answer "who
   * may do this" for anybody.
   *
   * `ownerId` is the caller, passed in by the controller — no lookup, because
   * the account was authenticated to get here, and no field, because a body
   * that could name an owner would let anybody create a tree somebody else
   * owns.
   */
  create(dto: CreateTreeDto, ownerId: string): Promise<TreeDto> {
    return this.prisma.$transaction(async (tx) => {
      const tree = await tx.tree.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          coverPhotoUrl: dto.coverPhotoUrl ?? null,
          ownerId,
        },
      });

      await tx.membership.create({
        data: {
          treeId: tree.id,
          userId: ownerId,
          role: 'OWNER',
          status: 'ACTIVE',
          acceptedAt: new Date(),
        },
      });

      return tree;
    });
  }

  async update(id: string, dto: UpdateTreeDto): Promise<TreeDto> {
    assertSomeField(dto);

    if (dto.successorId !== undefined && dto.successorId !== null) {
      const successor = await this.prisma.user.findUnique({
        where: { id: dto.successorId },
        select: { id: true },
      });
      if (successor === null) {
        throw new NotFoundException(
          `user ${dto.successorId} was not found — a successor must be an account.`,
        );
      }
    }

    return this.patch(id, {
      name: dto.name?.trim(),
      // `text()` rather than `dto.description?.trim()`: a cleared field
      // arrives as `null`, and `.trim()` on `null` is a 500.
      description: text(dto.description),
      coverPhotoUrl: dto.coverPhotoUrl,
      successorId: dto.successorId,
    });
  }

  /**
   * Deleting a tree removes its memberships, people, relations and memories
   * with it — the schema's `onDelete: Cascade` makes the whole branch one
   * statement instead of a list of deletes that could be forgotten.
   */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.tree.delete({ where: { id } });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(`tree ${id} was not found.`);
      }
      throw error;
    }
  }

  private async patch(
    id: string,
    data: Prisma.TreeUncheckedUpdateInput,
  ): Promise<TreeDto> {
    try {
      return await this.prisma.tree.update({ where: { id }, data });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(`tree ${id} was not found.`);
      }
      throw error;
    }
  }
}

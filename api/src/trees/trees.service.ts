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
   * With `memberId`, only trees where that user holds an **ACTIVE**
   * membership: an invitation that has not been accepted (FR-3.5) must not
   * put a tree into anyone's list, and filtering in the query rather than in
   * the view is what keeps that rule in one place.
   *
   * Without `memberId` every tree is returned. M2 has no authentication, so
   * this is the "who is asking" the API cannot yet answer; M3 narrows it to
   * the session's user and the open question disappears.
   */
  async list(memberId?: string): Promise<TreeDto[]> {
    if (memberId === undefined || memberId === '') {
      return this.prisma.tree.findMany({ orderBy: { createdAt: 'asc' } });
    }

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
   */
  async create(dto: CreateTreeDto): Promise<TreeDto> {
    const owner = await this.prisma.user.findUnique({
      where: { id: dto.ownerId },
      select: { id: true },
    });
    if (owner === null) {
      throw new NotFoundException(`user ${dto.ownerId} was not found.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const tree = await tx.tree.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          coverPhotoUrl: dto.coverPhotoUrl ?? null,
          ownerId: dto.ownerId,
        },
      });

      await tx.membership.create({
        data: {
          treeId: tree.id,
          userId: dto.ownerId,
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

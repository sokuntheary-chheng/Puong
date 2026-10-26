import { Injectable, NotFoundException } from '@nestjs/common';
import { MemoryVisibility, type Prisma } from '@prisma/client';
import { assertSomeField } from '../common/assert-some-field';
import { isMissingRecord } from '../common/is-missing-record';
import { text } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMemoryDto,
  MemoryDto,
  UpdateMemoryDto,
} from './dto/memories.dto';

@Injectable()
export class MemoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A tree's memories, optionally narrowed to one person, after FR-6.6 has
   * been applied.
   *
   * **FR-6.6 — a `PRIVATE` memory is returned only to its author**, and the
   * rule lives here rather than in a view or in the client: a filter the UI
   * applies is a filter a direct request bypasses. `viewerId` is how the
   * caller says who is asking — a stand-in for the session that M3's
   * authentication will supply instead, which is the one piece of "who is
   * calling" this milestone does not have.
   *
   * **FR-6.7 — newest occurred date first, undated last.** `nulls: 'last'`
   * matters: PostgreSQL's default for `DESC` is nulls *first*, so without it
   * every memory without a date would sit at the top of the timeline and
   * bury the ones that have one.
   */
  async list(
    treeId: string,
    options: { personId?: string; viewerId?: string } = {},
  ): Promise<MemoryDto[]> {
    await this.assertTree(treeId);

    const where: Prisma.MemoryWhereInput = {
      treeId,
      ...(options.personId === undefined ? {} : { personId: options.personId }),
      ...(options.viewerId === undefined
        ? {}
        : {
            OR: [
              { visibility: MemoryVisibility.TREE },
              { authorId: options.viewerId },
            ],
          }),
    };

    return this.prisma.memory.findMany({
      where,
      orderBy: [
        { happenedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  async get(
    treeId: string,
    memoryId: string,
    viewerId?: string,
  ): Promise<MemoryDto> {
    const memory = await this.prisma.memory.findFirst({
      where: { id: memoryId, treeId },
    });
    if (memory === null) {
      throw new NotFoundException(
        `memory ${memoryId} was not found in tree ${treeId}.`,
      );
    }
    // FR-6.6 again: a PRIVATE memory must be as invisible through this
    // endpoint as it is through the list — otherwise the list would filter
    // and guessing the id would still work.
    if (
      memory.visibility === MemoryVisibility.PRIVATE &&
      viewerId !== undefined &&
      memory.authorId !== viewerId
    ) {
      throw new NotFoundException(
        `memory ${memoryId} was not found in tree ${treeId}.`,
      );
    }
    return memory;
  }

  /**
   * Writes a memory (story 6).
   *
   * The date arrives as `''` from a cleared `<input type="date">` and is
   * stored as `null`: an empty string is not a date, and every reader would
   * otherwise have to special-case a value that is neither a date nor an
   * absence.
   */
  async create(treeId: string, dto: CreateMemoryDto): Promise<MemoryDto> {
    await this.assertTree(treeId);
    await this.assertInTree(treeId, dto.personId);
    await this.assertUser(dto.authorId);

    try {
      return await this.prisma.memory.create({
        data: {
          treeId,
          personId: dto.personId,
          authorId: dto.authorId,
          title: dto.title.trim(),
          body: dto.body.trim(),
          happenedAt: dto.happenedAt ?? null,
          photoUrl: dto.photoUrl ?? null,
          visibility: dto.visibility,
        },
      });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(`tree ${treeId} was not found.`);
      }
      throw error;
    }
  }

  async update(
    treeId: string,
    memoryId: string,
    dto: UpdateMemoryDto,
  ): Promise<MemoryDto> {
    assertSomeField(dto);
    await this.get(treeId, memoryId);

    try {
      return await this.prisma.memory.update({
        where: { id: memoryId },
        data: {
          title: dto.title?.trim(),
          body: dto.body?.trim(),
          happenedAt: dto.happenedAt === undefined ? undefined : dto.happenedAt,
          photoUrl: text(dto.photoUrl),
          visibility: dto.visibility,
        },
      });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(
          `memory ${memoryId} was not found in tree ${treeId}.`,
        );
      }
      throw error;
    }
  }

  async remove(treeId: string, memoryId: string): Promise<void> {
    await this.get(treeId, memoryId);

    try {
      await this.prisma.memory.delete({ where: { id: memoryId } });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(
          `memory ${memoryId} was not found in tree ${treeId}.`,
        );
      }
      throw error;
    }
  }

  private async assertTree(treeId: string): Promise<void> {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });
    if (tree === null) {
      throw new NotFoundException(`tree ${treeId} was not found.`);
    }
  }

  private async assertInTree(treeId: string, personId: string): Promise<void> {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, treeId },
      select: { id: true },
    });
    if (person === null) {
      throw new NotFoundException(
        `person ${personId} was not found in tree ${treeId}.`,
      );
    }
  }

  private async assertUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (user === null) {
      throw new NotFoundException(`user ${userId} was not found.`);
    }
  }
}

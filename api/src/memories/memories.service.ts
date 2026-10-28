import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemoryVisibility, type Prisma, type Role } from '@prisma/client';
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
   * applies is a filter a direct request bypasses. `viewerId` is required
   * (not optional, not a query parameter): it is the session's account, and
   * a call that does not know who is asking is not a call this API makes —
   * M2's `?viewerId=` was a stand-in for the session, and trusting it would
   * have meant trusting the client with the answer to FR-6.6.
   *
   * **FR-6.7 — newest occurred date first, undated last.** `nulls: 'last'`
   * matters: PostgreSQL's default for `DESC` is nulls *first*, so without it
   * every memory without a date would sit at the top of the timeline and
   * bury the ones that have one.
   */
  async list(
    treeId: string,
    options: { personId?: string; viewerId: string },
  ): Promise<MemoryDto[]> {
    await this.assertTree(treeId);

    const where: Prisma.MemoryWhereInput = {
      treeId,
      ...(options.personId === undefined ? {} : { personId: options.personId }),
      OR: [
        { visibility: MemoryVisibility.TREE },
        { authorId: options.viewerId },
      ],
    };

    return this.prisma.memory.findMany({
      where,
      orderBy: [
        { happenedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * One memory — with FR-6.6 applied as strictly as the list.
   *
   * A `PRIVATE` memory that is not the caller's is **404**, not 403: a 403
   * would confirm that the id exists, which is exactly what the list is
   * keeping secret, and guessing ids is the whole attack this closes.
   */
  async get(
    treeId: string,
    memoryId: string,
    viewerId: string,
  ): Promise<MemoryDto> {
    const memory = await this.prisma.memory.findFirst({
      where: { id: memoryId, treeId },
    });
    if (memory === null) {
      throw new NotFoundException(
        `memory ${memoryId} was not found in tree ${treeId}.`,
      );
    }
    if (
      memory.visibility === MemoryVisibility.PRIVATE &&
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
   *
   * `authorId` is the caller, so the row's provenance and its FR-6.6
   * visibility rule are decided by the server rather than by a field in the
   * request.
   */
  async create(
    treeId: string,
    dto: CreateMemoryDto,
    authorId: string,
  ): Promise<MemoryDto> {
    await this.assertTree(treeId);
    await this.assertInTree(treeId, dto.personId);

    try {
      return await this.prisma.memory.create({
        data: {
          treeId,
          personId: dto.personId,
          authorId,
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

  /**
   * Edits a memory — **the author only, always** (docs/design.md §2.2).
   *
   * Not "the owner may correct a story": an owner curates *records* (a date
   * on a person), and a memory is one person's account of the past. The
   * check is against the row because authorship does not exist in the path,
   * and the 403 comes back even for an OWNER, which is the point of it.
   */
  async update(
    treeId: string,
    memoryId: string,
    dto: UpdateMemoryDto,
    actorId: string,
  ): Promise<MemoryDto> {
    assertSomeField(dto);
    const memory = await this.get(treeId, memoryId, actorId);

    if (memory.authorId !== actorId) {
      throw new ForbiddenException(
        'Only the person who wrote a memory may change it.',
      );
    }

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

  /**
   * Deletes a memory. Three rules, for three reasons (FR-6.6, FR-6.8):
   *
   * - **Your own** — yes; the role guard has already established you are at
   *   least a CONTRIBUTOR, which is what the matrix requires for your own.
   * - **Somebody else's shared (`TREE`) memory** — OWNER only. Moderation
   *   is part of owning the tree; a contributor may not erase a story
   *   somebody else wrote.
   * - **Somebody else's private memory** — never, owner included: FR-6.6
   *   says the author does not see it either, and you cannot moderate what
   *   you cannot see. It is reported as **404**, not 403, for the same
   *   reason the read does — the caller has no business learning that the id
   *   is real.
   */
  async remove(
    treeId: string,
    memoryId: string,
    actorId: string,
    actorRole: Role,
  ): Promise<void> {
    const memory = await this.get(treeId, memoryId, actorId);

    if (memory.authorId !== actorId) {
      if (memory.visibility === MemoryVisibility.PRIVATE) {
        throw new NotFoundException(
          `memory ${memoryId} was not found in tree ${treeId}.`,
        );
      }
      if (actorRole !== 'OWNER') {
        throw new ForbiddenException(
          'Only the owner of the tree may delete a memory somebody else wrote.',
        );
      }
    }

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
}

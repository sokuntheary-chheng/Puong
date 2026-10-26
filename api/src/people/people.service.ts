import { Injectable, NotFoundException } from '@nestjs/common';
import { assertSomeField } from '../common/assert-some-field';
import { isMissingRecord } from '../common/is-missing-record';
import { text } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePersonDto,
  PersonDto,
  UpdatePersonDto,
} from './dto/people.dto';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every person in one tree.
   *
   * No pagination: the tree canvas draws them all in one pass and a page
   * would be a partial family — a graph with holes in it reads as a bug, not
   * as a next button. The stretch feature's pagination (six per page) lives
   * on search, where a result set can actually be unbounded.
   */
  async list(treeId: string): Promise<PersonDto[]> {
    await this.assertTree(treeId);
    return this.prisma.person.findMany({
      where: { treeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * One person, but only inside the tree named in the path.
   *
   * `findFirst({ id, treeId })` rather than `findUnique({ id })`: a person id
   * on its own is not enough to authorise anything, and answering from the
   * pair is what stops one tree's URL from reading another tree's person.
   */
  async get(treeId: string, personId: string): Promise<PersonDto> {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, treeId },
    });
    if (person === null) {
      throw new NotFoundException(
        `person ${personId} was not found in tree ${treeId}.`,
      );
    }
    return person;
  }

  async create(treeId: string, dto: CreatePersonDto): Promise<PersonDto> {
    await this.assertTree(treeId);
    await this.assertUser(dto.createdById);

    try {
      return await this.prisma.person.create({
        data: {
          treeId,
          fullName: dto.fullName.trim(),
          nickname: text(dto.nickname) ?? null,
          gender: dto.gender ?? null,
          birthDate: dto.birthDate ?? null,
          deathDate: dto.deathDate ?? null,
          isLiving: dto.isLiving ?? true,
          photoUrl: text(dto.photoUrl) ?? null,
          bio: text(dto.bio) ?? null,
          createdById: dto.createdById,
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
    personId: string,
    dto: UpdatePersonDto,
  ): Promise<PersonDto> {
    assertSomeField(dto);
    await this.get(treeId, personId);

    try {
      return await this.prisma.person.update({
        where: { id: personId },
        data: {
          fullName: dto.fullName?.trim(),
          // A key left out of the body keeps its column; `null` clears it.
          // `dto.x ?? null` would get this wrong — a PATCH that did not
          // mention a field would quietly erase it.
          nickname: text(dto.nickname),
          gender: dto.gender,
          birthDate: dto.birthDate,
          deathDate: dto.deathDate,
          isLiving: dto.isLiving,
          photoUrl: text(dto.photoUrl),
          bio: text(dto.bio),
        },
      });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(
          `person ${personId} was not found in tree ${treeId}.`,
        );
      }
      throw error;
    }
  }

  /**
   * Deleting a person takes their relations and memories with them (the
   * schema cascades) — a dangling edge would draw a connector to nobody, and
   * a memory with no subject is not a memory of anything.
   */
  async remove(treeId: string, personId: string): Promise<void> {
    await this.get(treeId, personId);

    try {
      await this.prisma.person.delete({ where: { id: personId } });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(
          `person ${personId} was not found in tree ${treeId}.`,
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

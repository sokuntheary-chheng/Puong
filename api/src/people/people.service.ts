import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
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

  /**
   * Adds a person, recorded as created by the caller.
   *
   * `createdById` comes from the session (FR-4.4 makes it the ownership
   * column that decides who may edit this person later), so it is set here
   * rather than read from the body: provenance that a client can type in is
   * not provenance.
   */
  async create(
    treeId: string,
    dto: CreatePersonDto,
    createdById: string,
  ): Promise<PersonDto> {
    await this.assertTree(treeId);

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
          createdById,
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
    actorId: string,
    actorRole: Role,
  ): Promise<PersonDto> {
    assertSomeField(dto);
    /* One read, two questions: is this person in this tree, and did the
       caller create them? The role guard has already settled "is a member
       with at least CONTRIBUTOR"; what it cannot see is this row's
       `createdById`, which is the ownership half of FR-4.4. */
    this.assertMayEdit(await this.get(treeId, personId), actorId, actorRole);

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
  async remove(
    treeId: string,
    personId: string,
    actorId: string,
    actorRole: Role,
  ): Promise<void> {
    this.assertMayEdit(await this.get(treeId, personId), actorId, actorRole);

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

  /**
   * FR-4.4 / FR-4.5 — "you created it, or you own the tree".
   *
   * A contributor may edit and delete their own additions and nobody else's;
   * an owner curates the whole tree. This is checked against the row that
   * was just loaded, because `createdById` does not exist in the path.
   */
  private assertMayEdit(
    person: PersonDto,
    actorId: string,
    actorRole: Role,
  ): void {
    if (person.createdById === actorId) return;
    if (actorRole === 'OWNER') return;
    throw new ForbiddenException(
      'Only the person who added this record, or the owner of the tree, may change it.',
    );
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
}

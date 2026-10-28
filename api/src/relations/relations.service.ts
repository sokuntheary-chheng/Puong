import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RelationType } from '@prisma/client';
import { isMissingRecord } from '../common/is-missing-record';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRelationDto, RelationDto } from './dto/relations.dto';

@Injectable()
export class RelationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(treeId: string): Promise<RelationDto[]> {
    await this.assertTree(treeId);
    return this.prisma.relation.findMany({ where: { treeId } });
  }

  /**
   * Creates one link, after three checks that a database constraint alone
   * would not make:
   *
   * 1. **No self-link** (`fromId === toId`) — a person is not their own
   *    parent, spouse or sibling. Nothing in the schema stops it and the
   *    graph would draw a connector from a card to itself.
   * 2. **Both people are in this tree** — a relation reaching across two
   *    families would put an edge in one graph that points at a card which is
   *    not there.
   * 3. **No ancestor cycle** for `PARENT` — A cannot be the parent of their
   *    own great-grandparent. The generations pass (FR-8.1) is derived by
   *    walking parent edges, and a cycle makes that walk never finish; the
   *    check is a graph walk rather than a depth counter because depth is
   *    what the cycle corrupts. It is **409, not 400** (FR-5.4): the request
   *    is well-formed, it simply *conflicts with the graph that is already
   *    there* — which is what 409 means, and what `docs/api.md` now records.
   *    M2 answered 400 here; M4 changed the code rather than the
   *    requirement, because the requirement was the right one.
   *
   * A fourth case — the same link twice — is the unique index on
   * `(treeId, fromId, toId, type)` and reaches the client as a 409 through
   * `ApiExceptionFilter`, which is exactly what "already related this way"
   * should look like.
   */
  async create(treeId: string, dto: CreateRelationDto): Promise<RelationDto> {
    await this.assertTree(treeId);

    if (dto.fromId === dto.toId) {
      throw new BadRequestException([
        'A person cannot be related to themselves.',
      ]);
    }

    await this.assertInTree(treeId, dto.fromId);
    await this.assertInTree(treeId, dto.toId);

    if (dto.type === RelationType.PARENT) {
      await this.assertNoParentCycle(treeId, dto.fromId, dto.toId);
    }

    try {
      return await this.prisma.relation.create({
        data: {
          treeId,
          fromId: dto.fromId,
          toId: dto.toId,
          type: dto.type,
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
   * Removes a link.
   *
   * Deleting an edge removes a relationship, not the people in it — the two
   * cards stay in the tree, which is what "unlink" should mean to a family
   * correcting a mistaken marriage.
   */
  async remove(treeId: string, relationId: string): Promise<void> {
    // `deleteMany` scoped to the tree rather than `delete`: the scope is
    // what makes "a relation id from another tree" a 404 instead of a
    // cross-tree delete, and `deleteMany` reports a miss as `count === 0`
    // instead of raising P2025.
    const deleted = await this.prisma.relation.deleteMany({
      where: { id: relationId, treeId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(
        `relation ${relationId} was not found in tree ${treeId}.`,
      );
    }
  }

  /**
   * Would this parent link make someone their own ancestor?
   *
   * The new edge says *`fromId` is the parent of `toId`*, so a loop appears
   * exactly when `toId` is **already** an ancestor of `fromId`: walk *up*
   * from `fromId` (each `PARENT` edge read backwards, child to parent) and
   * the loop is real if `toId` turns up on the way.
   *
   * Worked example from the seed: `p01` is already the parent of `p03`.
   * Adding *`p03` is the parent of `p01`* walks up from `p03` through `p01`
   * and finds it immediately — two people who are each other's parent.
   *
   * Breadth-first with a `seen` set: without the set, a loop already present
   * in the data would never terminate, and the whole point of the check is
   * to be the thing that terminates.
   */
  private async assertNoParentCycle(
    treeId: string,
    fromId: string,
    toId: string,
  ): Promise<void> {
    const edges = await this.prisma.relation.findMany({
      where: { treeId, type: RelationType.PARENT },
      select: { fromId: true, toId: true },
    });

    const parentsOf = new Map<string, string[]>();
    for (const edge of edges) {
      const parents = parentsOf.get(edge.toId) ?? [];
      parents.push(edge.fromId);
      parentsOf.set(edge.toId, parents);
    }

    const queue = [fromId];
    const seen = new Set<string>([fromId]);

    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (current === toId) {
        throw new ConflictException([
          `That link would make ${toId} their own ancestor — the tree cannot loop.`,
        ]);
      }
      for (const parent of parentsOf.get(current) ?? []) {
        if (!seen.has(parent)) {
          seen.add(parent);
          queue.push(parent);
        }
      }
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

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertSomeField } from '../common/assert-some-field';
import { isMissingRecord } from '../common/is-missing-record';
import { text } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateTreeDto,
  SuccessorDto,
  SuccessorshipDto,
  TreeDto,
  UpdateTreeDto,
} from './dto/trees.dto';

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

    /* Three outcomes, and `undefined` is one of them on purpose: `null`
       clears the date (the nomination was withdrawn), a `Date` sets it, and
       `undefined` leaves the column alone — which is what a rename does.
       Encoding "leave it" as `null` is how a rename would silently erase
       when the successor was nominated. */
    let nominateAt: Date | null | undefined;
    if (dto.successorId !== undefined) {
      nominateAt = await this.assertNominee(id, dto.successorId);
    }

    return this.patch(id, {
      name: dto.name?.trim(),
      // `text()` rather than `dto.description?.trim()`: a cleared field
      // arrives as `null`, and `.trim()` on `null` is a 500.
      description: text(dto.description),
      coverPhotoUrl: dto.coverPhotoUrl,
      successorId: dto.successorId,
      successorNominatedAt: nominateAt,
    });
  }

  /**
   * FR-9.1 — *who may be nominated*, checked before the row is touched.
   *
   * Three rules, and each one exists because the API is where "successor"
   * stops being a word and starts being an ownership transfer:
   *
   * 1. **They must exist** — 404 otherwise, same as any other id that names
   *    no account.
   * 2. **They must already be an ACTIVE member of *this* tree**, so the
   *    nomination cannot hand a family archive to a stranger who once was
   *    invited, and cannot be aimed across trees by a crafted body.
   * 3. **Their role must be `CONTRIBUTOR` or `OWNER`** — a `VIEWER` has
   *    said by their role that they are here to look, and becoming the owner
   *    of a tree they may not write to is not a promotion anybody asked for.
   *
   * Returns what to write for `successorNominatedAt`: a `Date` for a new
   * nomination, `null` when the nomination is withdrawn, and `undefined`
   * when the same person is nominated again and the original date stands.
   */
  private async assertNominee(
    treeId: string,
    successorId: string | null,
  ): Promise<Date | null | undefined> {
    if (successorId === null) return null;

    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: { successorId: true },
    });
    if (tree === null)
      throw new NotFoundException(`tree ${treeId} was not found.`);

    const membership = await this.prisma.membership.findUnique({
      where: { treeId_userId: { treeId, userId: successorId } },
      select: { role: true, status: true },
    });
    if (membership === null || membership.status !== 'ACTIVE') {
      throw new NotFoundException(
        `user ${successorId} is not an active member of this tree — a successor is chosen from among its members.`,
      );
    }
    if (membership.role === 'VIEWER') {
      throw new BadRequestException(
        'A successor must be a contributor or an owner of this tree; a viewer cannot take it over.',
      );
    }

    /* Re-nominating the same person keeps the original date rather than
       restamping it: "nominated on" answers when the owner first decided,
       and a body that resends the row should not rewrite that answer.
       `undefined` rather than `null` — `null` is the *withdraw* answer and
       would erase the date this sentence says to keep. */
    return tree.successorId === successorId ? undefined : new Date();
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

  /**
   * FR-9.1 — the succession state of one tree, readable by any member.
   *
   * The successor reads it to answer the nomination and the owner reads it
   * to see whether their nomination still stands, so it is one endpoint
   * rather than two roles' private views of the same row: the row has no
   * secrets, and splitting it would mean two places to keep the rules of
   * "who owns this tree tomorrow" straight.
   */
  async successorOf(treeId: string): Promise<SuccessorDto> {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: {
        id: true,
        ownerId: true,
        successorId: true,
        successorNominatedAt: true,
        ownershipTransferredAt: true,
        previousOwnerId: true,
        owner: { select: { displayName: true } },
        successor: { select: { displayName: true } },
      },
    });
    if (tree === null)
      throw new NotFoundException(`tree ${treeId} was not found.`);

    return {
      treeId: tree.id,
      successorId: tree.successorId,
      successorName: tree.successor?.displayName ?? null,
      nominatedAt: tree.successorNominatedAt,
      ownerId: tree.ownerId,
      ownerName: tree.owner.displayName,
      ownershipTransferredAt: tree.ownershipTransferredAt,
      previousOwnerId: tree.previousOwnerId,
    };
  }

  /**
   * FR-9.1 — every tree that has nominated *me*, so the home page can put
   * the pending request where the person who has to answer it will see it.
   *
   * One query across all of my trees instead of one per tree: the home page
   * is the first screen after sign-in, and it should not spend its first
   * request per tree discovering that nothing is waiting.
   */
  async successorships(userId: string): Promise<SuccessorshipDto[]> {
    const rows = await this.prisma.tree.findMany({
      where: {
        successorId: userId,
        successorNominatedAt: { not: null },
      },
      select: {
        id: true,
        name: true,
        successorNominatedAt: true,
        ownerId: true,
        owner: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      treeId: row.id,
      treeName: row.name,
      ownerId: row.ownerId,
      ownerName: row.owner.displayName,
      nominatedAt: row.successorNominatedAt as Date,
    }));
  }

  /**
   * FR-9.2 — the nominated successor accepts, and ownership moves.
   *
   * Four writes in one transaction, because a transfer that half-applies is
   * the worst state this application can be in: two owners, or an owner who
   * is not on the member list.
   *
   * 1. `Tree.ownerId` becomes the successor, with `previousOwnerId` and
   *    `ownershipTransferredAt` written alongside it — that pair *is* FR-9.3's
   *    record, and writing it in the same transaction is what guarantees the
   *    record exists for every transfer that actually happened.
   * 2. The nomination is cleared (id and date together).
   * 3. The successor's membership becomes `OWNER`.
   * 4. The previous owner's membership becomes `CONTRIBUTOR` — demoted, not
   *    removed: they keep their people, their memories and their place in
   *    the tree, which is the whole point of a succession rather than a
   *    takeover. `updateMany` rather than `update` so a tree whose owner row
   *    was written outside this API still transfers instead of failing the
   *    transaction on a missing record.
   */
  async acceptSuccessor(treeId: string, actorId: string): Promise<TreeDto> {
    const pending = await this.assertPendingNomination(treeId, actorId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tree.update({
        where: { id: pending.id },
        data: {
          ownerId: actorId,
          previousOwnerId: pending.ownerId,
          ownershipTransferredAt: new Date(),
          successorId: null,
          successorNominatedAt: null,
        },
      });

      await tx.membership.update({
        where: { treeId_userId: { treeId, userId: actorId } },
        data: { role: 'OWNER', status: 'ACTIVE' },
      });

      await tx.membership.updateMany({
        where: { treeId, userId: pending.ownerId },
        data: { role: 'CONTRIBUTOR' },
      });

      return updated;
    });
  }

  /**
   * FR-9.2 — the nomination is declined: the id and its date go together,
   * so the tree is left exactly as it was before the owner nominated
   * anybody. The owner keeps a record nowhere — declining is not a transfer,
   * and FR-9.3 asks to record transfers.
   */
  async declineSuccessor(treeId: string, actorId: string): Promise<TreeDto> {
    await this.assertPendingNomination(treeId, actorId);
    return this.patch(treeId, {
      successorId: null,
      successorNominatedAt: null,
    });
  }

  /**
   * Whether this tree has a nomination waiting, and whether *this caller* is
   * the one it names.
   *
   * Answered with three different errors on purpose: 404 for a tree that is
   * not there, 409 for a nomination that no longer exists (it was withdrawn
   * or already answered — a conflict with the state the caller believed), and
   * 403 for a nomination that exists but is somebody else's. A single 403 for
   * all three would tell a legitimate successor nothing about what actually
   * went wrong.
   */
  private async assertPendingNomination(
    treeId: string,
    actorId: string,
  ): Promise<{
    id: string;
    ownerId: string;
  }> {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, ownerId: true, successorId: true },
    });
    if (tree === null)
      throw new NotFoundException(`tree ${treeId} was not found.`);

    if (tree.successorId === null) {
      throw new ConflictException(
        'This tree has no nomination waiting — it may already have been answered.',
      );
    }
    if (tree.successorId !== actorId) {
      throw new ForbiddenException(
        'Only the nominated successor can answer this nomination.',
      );
    }
    return tree;
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

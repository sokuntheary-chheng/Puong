import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PHOTO_URL_MESSAGE, PHOTO_URL_PATTERN } from '../../common/photo-url';

/**
 * Creating a tree also creates its OWNER membership, so the creator is
 * stored as the owner in the same transaction (story 1's acceptance
 * criterion) — there is no window in which a tree exists with nobody in it.
 *
 * There is **no `ownerId` field**: the owner is the signed-in account, read
 * from the session by the controller. A body that could name an owner would
 * be an escalation path — anybody could create a tree owned by somebody
 * else, or claim one they never made.
 */
export class CreateTreeDto {
  @ApiProperty({
    example: 'Mango family',
    minLength: 2,
    maxLength: 120,
    description: 'Shown as the title of the workspace.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    example: 'Four generations, from Mr. Mango in 1935 onward.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: '/api/uploads/3f9c1a7be2d04f5c8a61b7d90e4c2f11.jpg',
    maxLength: 500,
    description:
      'FR-6.2 — the url an upload returned; no other shape is accepted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(PHOTO_URL_PATTERN, { message: PHOTO_URL_MESSAGE })
  coverPhotoUrl?: string;
}

/** The owner cannot be reassigned by editing a tree — that is a membership
 *  change (story 10, ownership transfer), not a field on the row. */
export class UpdateTreeDto extends PartialType(CreateTreeDto) {
  @ApiPropertyOptional({
    example: 'u2',
    nullable: true,
    description:
      'FR-9.1 — nominate a successor (or `null` to withdraw the nomination). The nominee must be an ACTIVE member of this tree whose role is `CONTRIBUTOR` or `OWNER`; ownership itself only moves when they accept (FR-9.2).',
  })
  @IsOptional()
  @IsString()
  successorId?: string | null;
}

/**
 * FR-9.1 / FR-9.3 — the state of a tree's succession, read by *any* member:
 * the successor needs it to answer, and the owner needs it to see whether
 * their nomination is still standing.
 *
 * Both halves are nullable on purpose and the body is never `null`: "who is
 * the nominated successor" is a state of the tree with a legitimate "nobody",
 * and answering 200 with the absence written down means one shape for the
 * client to render instead of a success and a 404 that mean the same thing.
 *
 * `previousOwnerId` and `ownershipTransferredAt` are the transfer record of
 * FR-9.3 — deliberately a plain id with no relation (see `schema.prisma`):
 * history must survive the account it names leaving.
 */
export class SuccessorDto {
  @ApiProperty({ example: 't1' })
  treeId: string;

  @ApiProperty({ example: 'u3', nullable: true })
  successorId: string | null;

  @ApiProperty({ example: 'Auntie Sreyneang', nullable: true })
  successorName: string | null;

  @ApiProperty({ example: '2026-10-21T08:00:00.000Z', nullable: true })
  nominatedAt: Date | null;

  @ApiProperty({ example: 'u1' })
  ownerId: string;

  @ApiProperty({ example: 'Sokuntheary Chheng' })
  ownerName: string;

  @ApiProperty({ example: '2026-10-22T08:00:00.000Z', nullable: true })
  ownershipTransferredAt: Date | null;

  @ApiProperty({ example: 'u1', nullable: true })
  previousOwnerId: string | null;
}

/** FR-9.1 — one tree that has nominated the signed-in account. */
export class SuccessorshipDto {
  @ApiProperty({ example: 't2' })
  treeId: string;

  @ApiProperty({ example: 'Mangosteen family' })
  treeName: string;

  @ApiProperty({ example: 'u1' })
  ownerId: string;

  @ApiProperty({ example: 'Sokuntheary Chheng' })
  ownerName: string;

  @ApiProperty({ example: '2026-10-21T08:00:00.000Z' })
  nominatedAt: Date;
}

export class TreeDto {
  @ApiProperty({ example: 't1' })
  id: string;

  @ApiProperty({ example: 'Mango family' })
  name: string;

  @ApiProperty({
    example: 'Four generations of the Mango family…',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ nullable: true })
  coverPhotoUrl: string | null;

  @ApiProperty({ example: 'u1' })
  ownerId: string;

  @ApiProperty({ example: null, nullable: true })
  successorId: string | null;

  @ApiProperty({ example: '2026-09-01T08:30:00.000Z' })
  createdAt: Date;
}

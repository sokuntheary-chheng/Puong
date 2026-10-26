import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
    example: 'https://cdn.puong.dev/trees/mango.jpg',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverPhotoUrl?: string;
}

/** The owner cannot be reassigned by editing a tree — that is a membership
 *  change (story 10, ownership transfer), not a field on the row. */
export class UpdateTreeDto extends PartialType(CreateTreeDto) {
  @ApiPropertyOptional({
    example: 'u2',
    nullable: true,
    description: 'FR-9.1 — the nominated successor, or null for none.',
  })
  @IsOptional()
  @IsString()
  successorId?: string | null;
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

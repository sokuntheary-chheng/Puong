import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { MemoryVisibility } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from '../../common/is-calendar-date.decorator';

/**
 * A memory attached to one person — story 6.
 *
 * The rules here mirror `web/src/utils/memoryValidation.ts` field for field,
 * because the same form writes through both: a title and a body are required
 * (FR-6.1), the date is optional but must be a real day when present, and
 * `visibility` decides who may read it (FR-6.6). Where the browser checks a
 * shape, the server checks the same shape *and* that the date exists —
 * the browser's word is not trusted (IF-1.7).
 *
 * No length limit is invented for title or body: the specification sets one
 * for tree names (FR-2.2) and is silent here, so a bound would be my rule,
 * not the specification's. `maxLength` below is only a stop against a
 * pathological payload.
 */
export class CreateMemoryDto {
  @ApiProperty({ example: 'p09', description: 'Who the memory is about.' })
  @IsString()
  @IsNotEmpty({ message: 'must not be empty.' })
  personId: string;

  /* No `authorId`: the writer is the signed-in account, read from the
     session by the controller. M2 accepted it in the body because there was
     no session to read; a body field that says who wrote a memory is a body
     field that can put somebody else's name on their story. */

  @ApiProperty({ example: 'The New Year at grandmother’s', minLength: 1 })
  @IsString()
  @IsNotEmpty({ message: 'A title is required.' })
  @MaxLength(200)
  title: string;

  @ApiProperty({
    example: 'Everyone came at six; there were forty of us in the yard.',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty({ message: 'A body is required.' })
  @MaxLength(20000)
  body: string;

  @ApiPropertyOptional({
    example: '2019-04-14',
    nullable: true,
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    description: 'FR-6.1 — optional; a memory may belong to no particular day.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsCalendarDate({
    message: 'must be a real calendar date in the form YYYY-MM-DD.',
  })
  happenedAt?: string | null;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  @ApiProperty({
    enum: MemoryVisibility,
    example: MemoryVisibility.TREE,
    description:
      'FR-6.6 — `PRIVATE` is readable only by its author, `TREE` by every member of the tree.',
  })
  @IsEnum(MemoryVisibility)
  visibility: MemoryVisibility;
}

/**
 * An edit cannot re-attribute a memory: `personId` and `authorId` are left
 * out, so a PATCH can retitle, redate, re-photograph and change who may see
 * it — but "who wrote it" and "who it is about" are facts about the row.
 * (`authorId` has no request field at all any more; `personId` still does
 * and is simply not editable.)
 */
export class UpdateMemoryDto extends PartialType(
  OmitType(CreateMemoryDto, ['personId'] as const),
) {}

export class MemoryDto {
  @ApiProperty({ example: 'mm1' })
  id: string;

  @ApiProperty({ example: 't1' })
  treeId: string;

  @ApiProperty({ example: 'p09' })
  personId: string;

  @ApiProperty({ example: 'u1' })
  authorId: string;

  @ApiProperty({ example: 'The New Year at grandmother’s' })
  title: string;

  @ApiProperty({ example: 'Everyone came at six.' })
  body: string;

  @ApiProperty({ example: '2019-04-14', nullable: true })
  happenedAt: string | null;

  @ApiProperty({ nullable: true })
  photoUrl: string | null;

  @ApiProperty({ enum: MemoryVisibility, example: MemoryVisibility.TREE })
  visibility: MemoryVisibility;

  @ApiProperty({ example: '2026-09-01T08:00:00.000Z' })
  createdAt: Date;
}

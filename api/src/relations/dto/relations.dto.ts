import { ApiProperty, PartialType } from '@nestjs/swagger';
import { RelationType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

/**
 * A link between two people **of the same tree**.
 *
 * `fromId` and `toId` mean different things per type, so the field
 * descriptions carry the vocabulary the graph uses — see PROPOSAL.md,
 * "Why these relations":
 *
 * - `PARENT`   — `from` is the parent, `to` is the child (the only directed one)
 * - `SPOUSE`   — `from` and `to` are married
 * - `SIBLING`  — `from` and `to` share a parent
 * - `FRIEND`   — `from` and `to` are friends; recorded, never drawn (FR-5.4)
 */
export class CreateRelationDto {
  @ApiProperty({
    example: 'p01',
    description: 'See the table in the class doc.',
  })
  @IsString()
  @IsNotEmpty({ message: 'must not be empty.' })
  fromId: string;

  @ApiProperty({ example: 'p09' })
  @IsString()
  @IsNotEmpty({ message: 'must not be empty.' })
  toId: string;

  @ApiProperty({
    enum: RelationType,
    example: RelationType.PARENT,
    description:
      'FR-5.1 — four kinds, and the shape of each is documented above.',
  })
  @IsEnum(RelationType)
  type: RelationType;
}

/** A relation has no editable field — change it by deleting and re-creating. */
export class UpdateRelationDto extends PartialType(CreateRelationDto) {}

export class RelationDto {
  @ApiProperty({ example: 'r01' })
  id: string;

  @ApiProperty({ example: 't1' })
  treeId: string;

  @ApiProperty({ example: 'p01' })
  fromId: string;

  @ApiProperty({ example: 'p09' })
  toId: string;

  @ApiProperty({ enum: RelationType, example: RelationType.PARENT })
  type: RelationType;
}

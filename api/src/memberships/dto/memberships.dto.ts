import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { MembershipStatus, Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Adding a member is *inviting* them: the default status is `INVITED`, and a
 * caller has to say `ACTIVE` explicitly to admit somebody outright (which is
 * how the seed and the owner's own membership look). FR-3.5 — an invitation
 * that nobody has accepted puts nobody in anybody's list.
 */
export class CreateMembershipDto {
  @ApiProperty({
    example: 'u3',
    description: 'The account being invited.',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    enum: Role,
    example: Role.VIEWER,
    description:
      'FR-3.6 — scoped to this tree, never to the account: the same person can be an owner here and a viewer somewhere else.',
  })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({
    enum: MembershipStatus,
    default: MembershipStatus.INVITED,
    description: 'Omit to invite; send `ACTIVE` to admit without waiting.',
  })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}

/** Who a membership belongs to never changes — invite the other account. */
export class UpdateMembershipDto extends PartialType(
  OmitType(CreateMembershipDto, ['userId'] as const),
) {}

export class MembershipDto {
  @ApiProperty({ example: 'mb1' })
  id: string;

  @ApiProperty({ example: 't1' })
  treeId: string;

  @ApiProperty({ example: 'u1' })
  userId: string;

  @ApiProperty({ enum: Role, example: Role.OWNER })
  role: Role;

  @ApiProperty({ enum: MembershipStatus, example: MembershipStatus.ACTIVE })
  status: MembershipStatus;

  @ApiProperty({ example: '2026-09-02T09:00:00.000Z', nullable: true })
  invitedAt: Date | null;

  @ApiProperty({ example: '2026-09-02T10:00:00.000Z', nullable: true })
  acceptedAt: Date | null;
}

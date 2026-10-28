import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { MembershipStatus, Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Adding a member is *inviting* them: the default status is `INVITED`, and a
 * caller has to say `ACTIVE` explicitly to admit somebody outright (which is
 * how the seed and the owner's own membership look). FR-3.5 — an invitation
 * that nobody has accepted puts nobody in anybody's list.
 *
 * **FR-3.1 is an invitation by email, so `email` is the field the UI sends.**
 * `userId` remains accepted for the same reason it always existed — the seed
 * and `check-api.cjs` already speak in ids, and an owner who can see the
 * member list can see the ids in it. Exactly one of the two must be present;
 * `MembershipsService.create` is where that is decided, because "which one of
 * these two fields did you mean" is a rule about the pair, not about either
 * field's own format, and class-validator has no single annotation for it.
 */
export class CreateMembershipDto {
  @ApiPropertyOptional({
    example: 'u3',
    description:
      'The account being invited. Alternative to `email` — send exactly one of them.',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    example: 'auntie@puong.dev',
    description:
      'FR-3.1 — the address being invited. It must already have an account: there is no mail provider in this project, so an invitation to an unknown address would be an invitation nobody could ever accept (and is rejected with 404).',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

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
  OmitType(CreateMembershipDto, ['userId', 'email'] as const),
) {}

/**
 * FR-3.2 — one pending invitation, as it appears on the invited account's
 * home page. The tree comes with it: "you have been invited" without the
 * name of the family is a sentence nobody can act on, and the home page
 * should not have to issue one request per invitation to render a banner.
 *
 * `expiresAt` is derived from `invitedAt` (FR-3.4) rather than stored, so it
 * can never disagree with the date the invitation was actually sent.
 */
export class InvitationDto {
  @ApiProperty({ example: 'mb7' })
  membershipId: string;

  @ApiProperty({ example: 't1' })
  treeId: string;

  @ApiProperty({ example: 'Mangosteen family' })
  treeName: string;

  @ApiProperty({
    example: 'Four generations of the Mangosteen family…',
    nullable: true,
  })
  treeDescription: string | null;

  @ApiProperty({ example: 'Sokuntheary Chheng' })
  invitedBy: string;

  @ApiProperty({ enum: Role, example: Role.CONTRIBUTOR })
  role: Role;

  @ApiProperty({ example: '2026-10-20T09:00:00.000Z' })
  invitedAt: Date;

  @ApiProperty({
    example: '2026-10-27T09:00:00.000Z',
    description: 'FR-3.4 — `invitedAt` plus seven days. Derived, not stored.',
  })
  expiresAt: Date;
}

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

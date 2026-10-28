import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from '../../common/is-calendar-date.decorator';
import { IsOnOrAfter } from '../../common/is-on-or-after.decorator';
import { PHOTO_URL_MESSAGE, PHOTO_URL_PATTERN } from '../../common/photo-url';

export class CreatePersonDto {
  @ApiProperty({
    example: 'Chheng Sokuntheary',
    minLength: 1,
    maxLength: 120,
    description: 'FR-4.1 — the one field every person must have.',
  })
  @IsString()
  @IsNotEmpty({ message: 'must not be empty.' })
  @MaxLength(120)
  fullName: string;

  @ApiPropertyOptional({ example: 'Theary', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nickname?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.FEMALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    example: '1985-04-03',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    nullable: true,
    description:
      'Date only, and a date that exists — story 4 rejects a death date before it. A cleared date input sends `""`, which means "not known" and is turned into `null` here: `@IsOptional()` excuses `null`, but not the empty string.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsCalendarDate({
    message: 'must be a real calendar date in the form YYYY-MM-DD.',
  })
  birthDate?: string | null;

  @ApiPropertyOptional({
    example: '2020-11-19',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsCalendarDate({
    message: 'must be a real calendar date in the form YYYY-MM-DD.',
  })
  @IsOnOrAfter('birthDate', {
    message: 'must not be before birthDate.',
  })
  deathDate?: string | null;

  @ApiPropertyOptional({
    example: true,
    description:
      'The profile-completeness rule (FR-4.3) reads this, not the dates.',
  })
  @IsOptional()
  @IsBoolean()
  isLiving?: boolean;

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
  photoUrl?: string;

  @ApiPropertyOptional({
    example: 'Eldest of four, kept the family account books.',
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bio?: string;

  /* No `createdById` here, and that is the point: provenance is read from
     the session by the controller. M2 took it in the body because there was
     no session to read — a field that says who you are is a field that can
     be filled in with somebody else's name. It stays on `PersonDto`, where
     it is written by the server and returned to everybody. */
}

export class UpdatePersonDto extends PartialType(CreatePersonDto) {}

export class PersonDto {
  @ApiProperty({ example: 'p09' })
  id: string;

  @ApiProperty({ example: 't1' })
  treeId: string;

  @ApiProperty({ example: 'Chheng Sokuntheary' })
  fullName: string;

  @ApiProperty({ example: 'Theary', nullable: true })
  nickname: string | null;

  @ApiProperty({ enum: Gender, example: Gender.FEMALE, nullable: true })
  gender: Gender | null;

  @ApiProperty({
    example: '1985-04-03',
    nullable: true,
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  birthDate: string | null;

  @ApiProperty({ nullable: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  deathDate: string | null;

  @ApiProperty({ example: true })
  isLiving: boolean;

  @ApiProperty({ nullable: true })
  photoUrl: string | null;

  @ApiProperty({ nullable: true })
  bio: string | null;

  @ApiProperty({ example: 'u1', description: 'Who added this person.' })
  createdById: string;

  @ApiProperty({ example: '2026-09-01T08:00:00.000Z' })
  createdAt: Date;
}

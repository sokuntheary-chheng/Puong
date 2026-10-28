import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * What a client may send when creating a user.
 *
 * The password is hashed here in the service and never leaves it: there is no
 * `passwordHash` property on any request DTO and none on the response DTO
 * either, so a hash cannot be written by accident or read back by mistake.
 * `writeOnly` keeps it visible in Swagger, where it belongs, and out of every
 * response schema.
 */
export class CreateUserDto {
  @ApiProperty({
    example: 'cousin@puong.dev',
    description: 'Login address. Stored lower-cased and unique.',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Sreypov Chheng', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName: string;

  @ApiProperty({
    writeOnly: true,
    minLength: 8,
    maxLength: 72,
    description:
      'Plain text in the request only. Stored as a bcrypt digest with a cost of 10.',
  })
  @IsString()
  @MinLength(8)
  /** bcrypt truncates at 72 bytes; a longer limit would be a lie. */
  @MaxLength(72)
  password: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

/** A user as every endpoint returns it — no `passwordHash`, anywhere. */
export class UserDto {
  @ApiProperty({ example: 'u1' })
  id: string;

  @ApiProperty({ example: 'owner@puong.dev' })
  email: string;

  @ApiProperty({ example: 'Sokuntheary Chheng' })
  displayName: string;

  @ApiProperty({ example: '2026-09-01T08:00:00.000Z' })
  createdAt: Date;
}

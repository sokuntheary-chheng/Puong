import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { UserDto } from '../../users/dto/users.dto';

/**
 * The sign-in request.
 *
 * `email` is `@IsEmail` rather than "a string containing an @" because the
 * login endpoint is the one place an unauthenticated caller can make the
 * server do work: rejecting the obvious garbage in the pipe keeps bcrypt
 * from running on `*` and `aaaa` for somebody who is not even a user.
 */
export class LoginDto {
  @ApiProperty({ example: 'owner@puong.dev' })
  @IsEmail()
  email: string;

  @ApiProperty({
    writeOnly: true,
    minLength: 8,
    maxLength: 72,
    example: 'Passw0rd!',
    description:
      'Plain text in the request only; compared against a bcrypt digest.',
  })
  @IsString()
  @MinLength(8)
  /** bcrypt truncates at 72 bytes, so a longer "password" would not be one. */
  @MaxLength(72)
  password: string;
}

/**
 * What login and registration answer with: the account, and nothing else.
 *
 * Deliberately **no token in the body**. The session is set as an `httpOnly`
 * cookie by the controller, so there is no value in this response that
 * script running on the page can read — which is the whole point of the
 * storage choice MILESTONES.md defends.
 */
export class SessionDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;
}

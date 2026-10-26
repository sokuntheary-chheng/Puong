import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { assertSomeField } from '../common/assert-some-field';
import { isMissingRecord } from '../common/is-missing-record';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, UpdateUserDto, UserDto } from './dto/users.dto';

/**
 * Every projection of a user in this service uses `safeUser`. The hash is
 * selected out of the row rather than deleted from the response afterwards:
 * a field that is never fetched cannot be returned by the next endpoint
 * somebody adds.
 */
const safeUser = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
} as const;

/** Cost 10 ≈ 100ms per hash — bcrypt's own recommendation for a login. */
const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<UserDto[]> {
    return this.prisma.user.findMany({
      select: safeUser,
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: safeUser,
    });
    if (user === null) throw new NotFoundException(`user ${id} was not found.`);
    return user;
  }

  /**
   * Creates an account with a hashed password.
   *
   * Registration as a *flow* — a form, a session, a token — is M3. The
   * hashing belongs here and now: the moment a password can be stored, it has
   * to be stored as a digest, and a placeholder hash in the database would be
   * the one thing that must never exist.
   *
   * A duplicate email is `P2002` from the unique index, which
   * `ApiExceptionFilter` turns into 409 — one place decides what a clash
   * looks like, rather than every service catching its own.
   */
  async create(dto: CreateUserDto): Promise<UserDto> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.prisma.user.create({
      data: {
        email: normaliseEmail(dto.email),
        displayName: dto.displayName.trim(),
        passwordHash,
      },
      select: safeUser,
    });
  }

  /**
   * Changes one account — **your own** (M3 ownership check).
   *
   * The check is in the service rather than in the controller because this
   * is the only place that also loads the row: "is this id mine" and "does
   * this email still exist" come from one read, and there is no route to
   * the update that skips the comparison.
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
  ): Promise<UserDto> {
    if (id !== actorId) {
      throw new ForbiddenException('You can only change your own account.');
    }
    assertSomeField(dto);

    const passwordHash =
      dto.password === undefined
        ? undefined
        : await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          email:
            dto.email === undefined ? undefined : normaliseEmail(dto.email),
          displayName: dto.displayName?.trim(),
          passwordHash,
        },
        select: safeUser,
      });
    } catch (error) {
      if (isMissingRecord(error)) {
        throw new NotFoundException(`user ${id} was not found.`);
      }
      throw error;
    }
  }
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

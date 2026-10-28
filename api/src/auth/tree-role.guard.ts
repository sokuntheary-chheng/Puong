import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { AccessService, rank } from './access.service';
import type { Actor } from './auth.guard';

export const ROLE_KEY = 'puong:requiredRole';

/** What `@RequireRole(...)` stores: the minimum role, and where to read the tree id. */
interface RoleRequirement {
  role: Role;
  param: string;
}

/**
 * Roles are scoped per tree, so the requirement names both what is needed
 * and which path parameter holds the tree:
 *
 * ```ts
 * @Post()
 * @RequireRole('CONTRIBUTOR')          // @Controller('trees/:treeId/people')
 * create(...)
 *
 * @Delete(':id')
 * @RequireRole('OWNER', 'id')          // @Controller('trees')
 * remove(...)
 * ```
 *
 * The decorator says *how much*; ownership — "this person is yours", "you
 * wrote this memory" — is a fact about a row, so it is checked in the
 * service that has loaded the row. Splitting them is what keeps the two
 * rules from being confused: a role is a fact about the caller, ownership
 * is a fact about the record.
 */
export const RequireRole = (role: Role, param = 'treeId') =>
  SetMetadata(ROLE_KEY, { role, param } satisfies RoleRequirement);

/**
 * The caller's role in the tree of this route, as the role guard resolved it.
 *
 * A handler running behind `@RequireRole` can therefore read the role it
 * has already paid for instead of querying it a second time — which also
 * means the role used for an ownership decision is the very row the guard
 * approved, not a second read that could disagree with it.
 */
export const CurrentTreeRole = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Role => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { treeRole?: Role }>();
    if (request.treeRole === undefined) {
      throw new Error('No role on the request: TreeRoleGuard did not run.');
    }
    return request.treeRole;
  },
);

/**
 * The per-tree role check, in front of every route that names a tree.
 *
 * - Not an ACTIVE member of the tree in the path → **404** (FR-2.3 / FR-2.5:
 *   a tree you are not part of must be indistinguishable from one that does
 *   not exist, or the URL becomes an oracle for guessing tree ids).
 * - Member, but the role is too low → **403**, naming both roles so the UI
 *   can explain why a control it drew was refused.
 *
 * Authentication itself is the global `AuthGuard`; this guard runs after it
 * and reads `request.user`, which is why it is safe to assume it is there.
 */
@Injectable()
export class TreeRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.get<RoleRequirement>(
      ROLE_KEY,
      context.getHandler(),
    );
    if (requirement === undefined) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: Actor; treeRole?: Role }>();
    const user = request.user;
    if (user === undefined)
      throw new ForbiddenException('Sign in to continue.');

    // Express types a path parameter as `string | string[]`; the guard only
    // ever reads single-segment ids, so narrow it here rather than spread
    // a union through every check below.
    const treeId = request.params[requirement.param] as string | undefined;
    if (treeId === undefined || treeId === '') {
      throw new NotFoundException('That route does not name a tree.');
    }

    const role = await this.access.roleIn(treeId, user.id);
    if (role === null) throw this.access.notAMember(treeId);

    if (rank(role) < rank(requirement.role)) {
      throw this.access.insufficient(role, requirement.role);
    }

    request.treeRole = role;
    return true;
  }
}

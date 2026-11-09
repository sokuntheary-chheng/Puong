import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AccessService } from './access.service';
import { LoginThrottle } from './login-throttle.service';
import { TreeRoleGuard } from './tree-role.guard';
import { UsersModule } from '../users/users.module';

/**
 * Authentication, roles and the two guards that enforce them.
 *
 * Three decisions are made here rather than at the call sites:
 *
 * 1. **The `AuthGuard` is global** (`APP_GUARD`). A route is closed unless
 *    it is marked `@Public()`, so the failure mode of adding an endpoint is
 *    "nobody can call it yet", never "everybody can call it".
 * 2. **`AccessService` is exported from a `@Global` module** because the
 *    membership lookup is needed by every resource module (and by the guard
 *    that those modules pull in through `@UseGuards`), and writing it once
 *    is what keeps "ACTIVE membership means a role" from being re-derived
 *    with a different answer in each service.
 * 3. **The JWT secret comes from the environment and the app refuses to
 *    start without it.** A default secret is worse than a crash: a token
 *    signed with a value that is in a public repository is not signed at all.
 */
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      /* `ConfigModule.forRoot({ isGlobal: true })` in AppModule already makes
         ConfigService resolvable anywhere, so there is nothing to import. */
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (secret === undefined || secret === '') {
          throw new Error(
            'JWT_SECRET is not set. Copy api/.env.example to api/.env and set it — ' +
              'refusing to start with a missing signing secret.',
          );
        }
        return { secret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessService,
    LoginThrottle,
    TreeRoleGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AccessService, AuthService],
})
export class AuthModule {}

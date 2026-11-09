import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * How many *failed* sign-ins one address may make in a minute.
 *
 * Ten is a human pace — nobody mistypes a password ten times in sixty
 * seconds and keeps a straight face — while an automated guesser gets 14,400
 * attempts a day instead of unlimited.
 *
 * Failures only, which is the whole reason this is not simply a
 * `@Throttle()` decorator. The throttler counts requests, and a request that
 * *succeeds* is not an attack: a member signing in on three devices, or the
 * harness in `scripts/check-api.cjs` signing in as the whole demo family,
 * would otherwise be spending the same budget as a dictionary attack. Counting
 * only the attempts that did not work aims the limit at exactly the thing it
 * exists to slow down, and costs nothing in protection — an attacker does not
 * get to try more passwords for it.
 *
 * The key is an address, not an account: limiting per account would let one
 * machine spread a guess across every address in the family for free. Behind
 * nginx the address comes from `X-Forwarded-For`, which Express only honours
 * when `TRUST_PROXY` is on (see `main.ts`) — otherwise every visitor arrives
 * from the proxy's own address and the counter counts deployments, not people.
 *
 * State is a `Map` in this process. That is the honest limit of a
 * single-instance demo: restart the API and the counters start again, and a
 * second replica would keep its own. Both are a shared store away (Redis),
 * and both are listed in docs/security.md rather than pretended away here.
 */
@Injectable()
export class LoginThrottle {
  /** address → the instants of its failed attempts, oldest first. */
  private readonly failures = new Map<string, number[]>();

  private readonly windowMs = 60_000;
  private readonly limit = 10;

  /** When the map was last swept; see `sweep()`. */
  private lastSweep = Date.now();

  /**
   * Throws 429 if this address has already spent its ten failures.
   *
   * Called *before* the password is compared: a blocked address should not
   * be handed a bcrypt comparison to spend CPU on, and it should not be able
   * to tell an existing account from a missing one by how long the refusal
   * takes.
   */
  assertAllowed(address: string): void {
    this.maybeSweep();
    const recent = this.recentFailures(address);
    if (recent.length < this.limit) return;

    /* The wait really is "the rest of this minute", but the client is only
       told a round 60 — `ApiExceptionFilter` attaches `Retry-After: 60` to
       every 429, and a number a client can rely on is worth more than one
       that is five seconds more precise. */
    throw new HttpException(
      'Too many requests. Wait a moment and try again.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Records one failed attempt. Call it for a wrong password *and* a missing account. */
  recordFailure(address: string): void {
    this.maybeSweep();
    const recent = this.recentFailures(address);
    recent.push(Date.now());
    this.failures.set(address, recent);
  }

  /**
   * Drops every address whose window has closed.
   *
   * Without this the map would keep one entry per address that ever failed a
   * sign-in, forever — a small leak that only grows. A sweep at most once a
   * window bounds it: an entry lives no longer than two windows after its
   * last failure, and the work is one pass over a map that stays small.
   */
  private maybeSweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;

    const cutoff = now - this.windowMs;
    for (const [address, attempts] of this.failures) {
      const recent = attempts.filter((at) => at > cutoff);
      if (recent.length === 0) this.failures.delete(address);
      else this.failures.set(address, recent);
    }
  }

  /** The attempts still inside the window, dropping the rest as a side effect. */
  private recentFailures(address: string): number[] {
    const cutoff = Date.now() - this.windowMs;
    const recent = (this.failures.get(address) ?? []).filter(
      (at) => at > cutoff,
    );

    if (recent.length === 0) {
      this.failures.delete(address);
    } else {
      this.failures.set(address, recent);
    }
    return recent;
  }
}

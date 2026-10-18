import { Injectable } from '@nestjs/common';
import { config } from '../../config';

/**
 * FR-AUTH-08: at most N *failed* logins per window, counted separately per
 * identifier (email/phone) and per IP. Successful logins never count, and a
 * success clears the identifier's failures.
 *
 * In-memory, so it is per API process. Move it to Redis before running more than
 * one API instance.
 */
@Injectable()
export class LoginAttempts {
  private readonly failures = new Map<string, number[]>();

  /** Minutes until the caller may try again, or 0 when allowed. */
  retryAfterMinutes(identifier: string, ip: string | undefined, now = Date.now()): number {
    const { maxFailures, windowMs } = config().login;
    let waitMs = 0;
    for (const key of this.keys(identifier, ip)) {
      const recent = this.recent(key, now);
      if (recent.length >= maxFailures) waitMs = Math.max(waitMs, recent[0] + windowMs - now);
    }
    return waitMs > 0 ? Math.ceil(waitMs / 60_000) : 0;
  }

  recordFailure(identifier: string, ip: string | undefined, now = Date.now()): void {
    for (const key of this.keys(identifier, ip)) {
      this.failures.set(key, [...this.recent(key, now), now]);
    }
  }

  recordSuccess(identifier: string): void {
    this.failures.delete(`id:${identifier}`);
  }

  private keys(identifier: string, ip: string | undefined): string[] {
    return ip ? [`id:${identifier}`, `ip:${ip}`] : [`id:${identifier}`];
  }

  private recent(key: string, now: number): number[] {
    const { windowMs } = config().login;
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length === 0) this.failures.delete(key);
    return list;
  }
}

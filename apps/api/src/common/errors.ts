/**
 * Base for every domain error. Each module defines its own subclass with one
 * named constructor per failure mode (laravel-rest-api: error-named-constructors);
 * the exception filter maps them to `{ error: { code, message, fields? } }` in one place.
 */
export abstract class AppError extends Error {
  protected constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

const field = (name: string, message: string) => ({ [name]: [message] });

export class AuthError extends AppError {
  static unauthenticated(): AuthError {
    return new AuthError(401, 'unauthenticated', 'Log in to continue.');
  }

  /** Same message whether or not the account exists (FR-AUTH-03). */
  static wrongCredentials(): AuthError {
    return new AuthError(401, 'wrong_credentials', 'Email/phone or password is wrong.');
  }

  static emailTaken(): AuthError {
    const message = 'This email is already registered. Log in instead.';
    return new AuthError(409, 'email_taken', message, field('email', message));
  }

  static phoneTaken(): AuthError {
    const message = 'This phone number is already registered. Log in instead.';
    return new AuthError(409, 'phone_taken', message, field('phone', message));
  }

  static tooManyFailedLogins(minutes: number): AuthError {
    return new AuthError(429, 'rate_limited', `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

export class RequestError extends AppError {
  static csrfFailed(): RequestError {
    return new RequestError(403, 'csrf_failed', 'Refresh the page and try again.');
  }

  static missingIdempotencyKey(): RequestError {
    return new RequestError(400, 'idempotency_key_missing', 'Send an Idempotency-Key header with this request.');
  }

  /** The same key was sent again with a different body: a client bug, never a second record. */
  static idempotencyKeyReused(): RequestError {
    return new RequestError(409, 'idempotency_key_reused', 'This request key was already used for a different order.');
  }
}

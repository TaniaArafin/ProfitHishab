import { LoginAttempts } from './login-attempts';

describe('LoginAttempts (FR-AUTH-08)', () => {
  const T0 = Date.UTC(2026, 9, 18, 6, 0, 0);
  const MIN = 60_000;

  it('blocks after 5 failures for 15 minutes from the first, then allows again', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 5; i++) attempts.recordFailure('a@example.com', '10.0.0.1', T0 + i * MIN);
    expect(attempts.retryAfterMinutes('a@example.com', '10.0.0.9', T0 + 5 * MIN)).toBe(10);
    expect(attempts.retryAfterMinutes('a@example.com', '10.0.0.9', T0 + 15 * MIN)).toBe(0);
  });

  it('counts per IP across different accounts', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 5; i++) attempts.recordFailure(`user${i}@example.com`, '10.0.0.1', T0);
    expect(attempts.retryAfterMinutes('someone-else@example.com', '10.0.0.1', T0 + MIN)).toBe(14);
    expect(attempts.retryAfterMinutes('someone-else@example.com', '10.0.0.2', T0 + MIN)).toBe(0);
  });

  it('clears an account after a successful login', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 4; i++) attempts.recordFailure('a@example.com', undefined, T0);
    attempts.recordSuccess('a@example.com');
    attempts.recordFailure('a@example.com', undefined, T0);
    expect(attempts.retryAfterMinutes('a@example.com', undefined, T0)).toBe(0);
  });
});

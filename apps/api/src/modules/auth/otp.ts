import { createHash, randomInt } from 'node:crypto';

/** Registration codes: how long they live and how hard they are to guess or spam. */
export const OTP = {
  ttlSeconds: 10 * 60,
  resendSeconds: 60,
  maxPerHour: 5,
  maxAttempts: 5,
} as const;

/** A random 6-digit code, or the configured fixed one (dev and tests; production refuses it). */
export function newOtpCode(fixed: string | null): string {
  return fixed ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Codes are stored hashed and bound to their phone, like session tokens. */
export function hashOtp(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

/**
 * Seconds to wait before another code may be sent to a phone, or 0. Pure: the caller
 * passes the last send time, the sends in the past hour (oldest first) and now.
 */
export function otpSendWait(sentInLastHour: readonly Date[], now: Date): { reason: 'resend' | 'hourly'; seconds: number } | null {
  const last = sentInLastHour.at(-1);
  if (last) {
    const sinceLast = (now.getTime() - last.getTime()) / 1000;
    if (sinceLast < OTP.resendSeconds) return { reason: 'resend', seconds: Math.ceil(OTP.resendSeconds - sinceLast) };
  }
  if (sentInLastHour.length >= OTP.maxPerHour) {
    const oldest = sentInLastHour[sentInLastHour.length - OTP.maxPerHour];
    const freesAt = oldest.getTime() + 3_600_000;
    return { reason: 'hourly', seconds: Math.max(1, Math.ceil((freesAt - now.getTime()) / 1000)) };
  }
  return null;
}

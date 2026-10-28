import { hashOtp, newOtpCode, OTP, otpSendWait } from './otp';

describe('registration codes', () => {
  const now = new Date('2026-10-27T10:00:00Z');
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  it('makes a 6-digit code, or the fixed one when configured', () => {
    expect(newOtpCode(null)).toMatch(/^\d{6}$/);
    expect(newOtpCode('123456')).toBe('123456');
  });

  it('binds the hash to the phone, so a code for one number is useless on another', () => {
    expect(hashOtp('01712345678', '123456')).not.toBe(hashOtp('01812345678', '123456'));
    expect(hashOtp('01712345678', '123456')).toBe(hashOtp('01712345678', '123456'));
  });

  it('allows the first code and makes the seller wait a minute between codes', () => {
    expect(otpSendWait([], now)).toBeNull();
    expect(otpSendWait([ago(20)], now)).toEqual({ reason: 'resend', seconds: 40 });
    expect(otpSendWait([ago(OTP.resendSeconds)], now)).toBeNull();
  });

  it('stops at 5 codes an hour until the oldest one is an hour old', () => {
    const five = [ago(3000), ago(2400), ago(1800), ago(1200), ago(600)];
    expect(otpSendWait(five, now)).toEqual({ reason: 'hourly', seconds: 600 });
    expect(otpSendWait(five.slice(1), now)).toBeNull();
  });
});

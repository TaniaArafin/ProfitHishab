import { describe, expect, it } from 'vitest';
import {
  canTransition,
  orderTotals,
  parseTaka,
  formatTaka,
  formatTakaCompact,
  normalizePhone,
  percent,
  previousPeriod,
  resolvePeriod,
  registerSchema,
  toPoisha,
  trialDaysLeft,
  trialEndsAt,
  isTrialOver,
} from './index';

describe('normalizePhone', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['017-1234 5678', '01712345678'],
    ['০১৭১২৩৪৫৬৭৮', '01712345678'],
    ['1712345678', '01712345678'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '0171234567', '01212345678', 'abc', '+1 415 555 0100'])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('money', () => {
  it('converts taka to poisha without float drift', () => {
    expect(toPoisha(19.99)).toBe(1999);
    expect(toPoisha('2,500.50')).toBe(250050);
  });

  it('formats with South Asian grouping', () => {
    expect(formatTaka(52_000_000)).toBe('৳5,20,000');
    expect(formatTaka(-125_050)).toBe('−৳1,250.5');
    expect(formatTakaCompact(52_000_000)).toBe('৳5.2L');
    expect(formatTakaCompact(4_500_000)).toBe('৳45K');
  });

  it('rounds percentages to one decimal and guards zero', () => {
    expect(percent(12_000_000, 52_000_000)).toBe(23.1);
    expect(percent(5, 0)).toBe(0);
  });
});

describe('periods', () => {
  it('defaults to the current month in Dhaka time', () => {
    // 2026-09-30 19:00 UTC is already 1 October in Dhaka (UTC+6).
    const p = resolvePeriod({}, 'Asia/Dhaka', new Date('2026-09-30T19:00:00Z'));
    expect(p).toEqual({ from: '2026-10-01', to: '2026-10-31', preset: 'this-month' });
  });

  it('resolves last month across a year boundary', () => {
    const p = resolvePeriod({ period: 'last-month' }, 'Asia/Dhaka', new Date('2026-01-15T06:00:00Z'));
    expect(p).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('accepts a valid custom range and ignores an inverted one', () => {
    expect(resolvePeriod({ from: '2026-09-01', to: '2026-09-15' })).toMatchObject({ preset: 'custom' });
    expect(resolvePeriod({ from: '2026-09-15', to: '2026-09-01' }).preset).toBe('this-month');
  });

  it('computes the previous equal-length period', () => {
    expect(previousPeriod({ from: '2026-09-01', to: '2026-09-30' })).toEqual({ from: '2026-08-02', to: '2026-08-31' });
  });
});

describe('canTransition (FR-ORD-07)', () => {
  it('allows skipping forward and moving back', () => {
    expect(canTransition('new', 'delivered')).toBe(true);
    expect(canTransition('delivered', 'shipped')).toBe(true);
  });

  it('refuses cancelling a delivered order and returning an unshipped one', () => {
    expect(canTransition('delivered', 'cancelled')).toBe(false);
    expect(canTransition('returned', 'cancelled')).toBe(false);
    expect(canTransition('confirmed', 'returned')).toBe(false);
    expect(canTransition('shipped', 'returned')).toBe(true);
  });
});

describe('parseTaka', () => {
  it.each([
    ['2,500', 250000],
    ['19.99', 1999],
    ['0', 0],
    [' 120 ', 12000],
  ])('parses %s', (input, expected) => {
    expect(parseTaka(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.234', '1e3'])('rejects %s', (input) => {
    expect(parseTaka(input)).toBeNull();
  });
});

describe('orderTotals (FR-ORD-05)', () => {
  it('matches the reference order: 2 sarees, ৳300 off, ৳120 delivery', () => {
    const t = orderTotals([{ quantity: 2, unitPrice: 250000, unitCost: 135000 }], {
      discount: 30000,
      deliveryCharge: 12000,
      courierCost: 10000,
      packagingCost: 2000,
    });
    expect(t).toMatchObject({
      subtotal: 500000,
      total: 482000,
      productCost: 270000,
      estimatedProfit: 200000,
      discountExceedsSubtotal: false,
    });
  });

  it('flags a discount larger than the subtotal', () => {
    expect(orderTotals([{ quantity: 1, unitPrice: 100, unitCost: 50 }], { discount: 101, deliveryCharge: 0 }).discountExceedsSubtotal).toBe(
      true,
    );
  });
});

describe('free trial', () => {
  const now = new Date('2026-10-27T10:00:00Z');

  it('lasts 7 days for a new phone and none for a phone that already used it', () => {
    expect(trialEndsAt(now, false).toISOString()).toBe('2026-11-03T10:00:00.000Z');
    expect(trialEndsAt(now, true).toISOString()).toBe(now.toISOString());
  });

  it('is over at the end time, not before, and never for early-access sellers', () => {
    expect(isTrialOver('2026-10-27T10:00:01Z', now)).toBe(false);
    expect(isTrialOver('2026-10-27T10:00:00Z', now)).toBe(true);
    expect(isTrialOver(null, now)).toBe(false);
  });

  it('counts days left rounded up, 0 when over, null when unlimited', () => {
    expect(trialDaysLeft('2026-11-03T10:00:00Z', now)).toBe(7);
    expect(trialDaysLeft('2026-10-27T10:01:00Z', now)).toBe(1);
    expect(trialDaysLeft('2026-10-26T10:00:00Z', now)).toBe(0);
    expect(trialDaysLeft(null, now)).toBeNull();
  });
});

describe('registerSchema', () => {
  const base = { name: 'Nusrat', businessName: 'Shop', phone: '+880 1712-345678', password: 'secret-pass-1' };

  it('needs a verified phone code and accepts Bangla digits; email is optional', () => {
    expect(registerSchema.parse({ ...base, code: '১২৩ ৪৫৬' })).toMatchObject({ phone: '01712345678', code: '123456' });
    expect(registerSchema.safeParse({ ...base, code: '12345' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, phone: undefined, code: '123456', email: 'a@b.co' }).success).toBe(false);
  });
});

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
  trialBanner,
  trialEndsAt,
  isTrialOver,
  accessStatus,
  newAccessEnd,
  adminAccessSchema,
  adminBlockSchema,
  paymentSubmitSchema,
  importMappingSchema,
  importRowsQuerySchema,
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

  it('shows the banner from 3 days left, never for unlimited, and "ended" after the end', () => {
    expect(trialBanner(null, now)).toBeNull();
    expect(trialBanner('2026-10-31T10:00:00Z', now)).toBeNull(); // 4 days
    expect(trialBanner('2026-10-30T10:00:00Z', now)).toEqual({ kind: 'ending', daysLeft: 3 });
    expect(trialBanner('2026-10-27T15:00:00Z', now)).toEqual({ kind: 'ending', daysLeft: 1 });
    expect(trialBanner('2026-10-27T09:59:59.999Z', now)).toEqual({ kind: 'ended' });
  });
});

describe('registerSchema', () => {
  const base = { name: 'Nusrat', businessName: 'Shop', phone: '+880 1712-345678', password: 'secret-pass-1' };

  it('accepts a phone code with Bangla digits and spaces, and rejects a short one', () => {
    expect(registerSchema.parse({ ...base, code: '১২৩ ৪৫৬' })).toMatchObject({ phone: '01712345678', code: '123456' });
    expect(registerSchema.safeParse({ ...base, code: '12345' }).success).toBe(false);
  });

  it('needs an email or a phone; the code is optional here (the API decides if it is required)', () => {
    expect(registerSchema.parse({ ...base, phone: undefined, email: 'A@B.co' })).toMatchObject({ email: 'a@b.co' });
    expect(registerSchema.safeParse({ ...base, phone: '' }).success).toBe(false);
  });
});

describe('admin access changes', () => {
  const now = new Date('2026-11-06T10:00:00Z');
  const later = new Date('2026-11-10T10:00:00Z');

  it('derives the status: blocked first, then unlimited, trial or ended', () => {
    expect(accessStatus(later, now, now)).toBe('blocked');
    expect(accessStatus(null, null, now)).toBe('unlimited');
    expect(accessStatus(later, null, now)).toBe('trial');
    expect(accessStatus('2026-11-01T00:00:00Z', null, now)).toBe('ended');
  });

  it('extends from the current end while access is running, and from now once it has ended', () => {
    expect(newAccessEnd({ mode: 'extend', days: 7 }, later, now)?.toISOString()).toBe('2026-11-17T10:00:00.000Z');
    expect(newAccessEnd({ mode: 'extend', days: 7 }, new Date('2026-11-01T00:00:00Z'), now)?.toISOString()).toBe(
      '2026-11-13T10:00:00.000Z',
    );
    expect(newAccessEnd({ mode: 'extend', days: 1 }, null, now)?.toISOString()).toBe('2026-11-07T10:00:00.000Z');
  });

  it('runs "until" to the end of that day in Dhaka, and handles unlimited and end now', () => {
    expect(newAccessEnd({ mode: 'until', date: '2026-12-31' }, later, now)?.toISOString()).toBe('2026-12-31T17:59:59.999Z');
    expect(newAccessEnd({ mode: 'unlimited' }, later, now)).toBeNull();
    expect(newAccessEnd({ mode: 'end' }, later, now)?.toISOString()).toBe(now.toISOString());
  });

  it('validates admin input', () => {
    expect(adminAccessSchema.safeParse({ mode: 'extend', days: 0 }).success).toBe(false);
    expect(adminAccessSchema.safeParse({ mode: 'extend', days: '14' }).success).toBe(true);
    expect(adminAccessSchema.safeParse({ mode: 'until', date: '31/12/2026' }).success).toBe(false);
    expect(adminAccessSchema.safeParse({ mode: 'forever' }).success).toBe(false);
    expect(adminBlockSchema.safeParse({ reason: ' x ' }).success).toBe(false);
  });
});

describe('paymentSubmitSchema', () => {
  const ok = { method: 'bkash', months: 1, senderNumber: '01712345678', transactionId: '8N7A6D5C4B' };

  it('trims and uppercases the transaction ID', () => {
    const r = paymentSubmitSchema.parse({ ...ok, transactionId: ' 8n7a6d5c4b ' });
    expect(r.transactionId).toBe('8N7A6D5C4B');
  });

  it('normalises the sender number', () => {
    expect(paymentSubmitSchema.parse({ ...ok, senderNumber: '+8801712345678' }).senderNumber).toBe('01712345678');
  });

  it('accepts months as a string from a form and rejects 2', () => {
    expect(paymentSubmitSchema.parse({ ...ok, months: '3' }).months).toBe(3);
    expect(paymentSubmitSchema.safeParse({ ...ok, months: 2 }).success).toBe(false);
  });

  it('rejects a short transaction ID with the seller-facing message', () => {
    const r = paymentSubmitSchema.safeParse({ ...ok, transactionId: 'ABC' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('Enter the transaction ID from the bKash or Nagad SMS.');
  });
});

describe('import schemas', () => {
  const required = { phone: 'Phone', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' };

  it('importMappingSchema accepts the four required columns and defaults statuses to {}', () => {
    const r = importMappingSchema.safeParse({ columns: required });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.statuses).toEqual({});
      expect(r.data.columns.phone).toBe('Phone');
    }
  });

  it('importMappingSchema rejects a mapping without quantity, with fields[columns.quantity]', () => {
    const { quantity: _q, ...rest } = required;
    const r = importMappingSchema.safeParse({ columns: rest });
    expect(r.success).toBe(false);
    if (!r.success) {
      const fields: Record<string, string[]> = {};
      for (const i of r.error.issues) (fields[i.path.join('.')] ??= []).push(i.message);
      expect(fields['columns.quantity']).toEqual(['Choose the column for Quantity.']);
      expect(Object.keys(fields)).toEqual(['columns.quantity']);
    }
  });

  it('importRowsQuerySchema caps perPage at 100', () => {
    expect(importRowsQuerySchema.safeParse({ perPage: '101' }).success).toBe(false);
    const r = importRowsQuerySchema.parse({});
    expect(r).toMatchObject({ page: 1, perPage: 25 });
    expect(importRowsQuerySchema.parse({ perPage: '100', status: 'duplicate' }).status).toBe('duplicate');
  });
});

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerProfileDto } from '@ph/shared';
import type { ApiResult } from './client-api';
import { useCustomerLookup } from './hooks';

type Pending = { phone: string; resolve: (r: ApiResult<CustomerProfileDto | null>) => void };
const pending: Pending[] = [];

vi.mock('./client-api', () => ({
  api: (_method: string, path: string) =>
    new Promise<ApiResult<CustomerProfileDto | null>>((resolve) => {
      pending.push({ phone: new URLSearchParams(path.split('?')[1]).get('phone') ?? '', resolve });
    }),
}));

const customer = (phone: string, name: string) => ({ id: phone, name, phone }) as CustomerProfileDto;
const reply = (p: Pending, data: CustomerProfileDto | null) => p.resolve({ ok: true, data, body: { data } });

describe('useCustomerLookup', () => {
  beforeEach(() => {
    pending.length = 0;
  });

  it('waits for a complete number before looking it up', () => {
    const { result } = renderHook(() => useCustomerLookup('0171'));
    expect(result.current).toBeUndefined();
    expect(pending).toHaveLength(0);
  });

  it('ignores a slow answer for a number the user already changed', async () => {
    const { result, rerender } = renderHook(({ phone }) => useCustomerLookup(phone), { initialProps: { phone: '01711111111' } });
    rerender({ phone: '01822222222' });
    const [first, second] = pending;

    await act(async () => {
      reply(second, customer('01822222222', 'Second'));
      await Promise.resolve();
    });
    await act(async () => {
      reply(first, customer('01711111111', 'First (stale)'));
      await Promise.resolve();
    });

    expect(result.current?.name).toBe('Second');
  });

  it('returns null for a number with no customer yet', async () => {
    const { result } = renderHook(() => useCustomerLookup('+880 1712-345678'));
    expect(pending[0]?.phone).toBe('01712345678');
    await act(async () => {
      reply(pending[0], null);
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });
});

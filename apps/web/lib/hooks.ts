'use client';

import { useEffect, useState } from 'react';
import { normalizePhone, type CustomerProfileDto, type ProductDto } from '@ph/shared';
import { api } from './client-api';

/**
 * Data-fetching hooks for client components. Each effect ignores a response that
 * arrives after its inputs changed, so a slow reply never overwrites a newer one
 * (react.dev: "You Might Not Need an Effect" → fetching data).
 */

/** The customer with this phone number: `undefined` while the number is incomplete, `null` for a new number. */
export function useCustomerLookup(phone: string): CustomerProfileDto | null | undefined {
  const normalized = normalizePhone(phone);
  const [result, setResult] = useState<{ phone: string; customer: CustomerProfileDto | null } | null>(null);

  useEffect(() => {
    if (!normalized) return;
    let ignore = false;
    void api<CustomerProfileDto | null>('GET', `/customers/lookup?phone=${normalized}`).then((res) => {
      if (!ignore && res.ok) setResult({ phone: normalized, customer: res.data });
    });
    return () => {
      ignore = true;
    };
  }, [normalized]);

  // Derived during render: a stale result for a different number is never shown.
  if (!normalized || result?.phone !== normalized) return undefined;
  return result.customer;
}

/** Active products matching `term`, fetched after the user pauses typing. */
export function useProductSearch(term: string, { delayMs = 120, limit = 8 } = {}): { results: ProductDto[]; searching: boolean } {
  const query = term.trim();
  const [state, setState] = useState<{ query: string; results: ProductDto[] }>({ query: '', results: [] });

  useEffect(() => {
    if (!query) return;
    let ignore = false;
    const timer = setTimeout(() => {
      void api<ProductDto[]>('GET', `/products?status=active&perPage=${limit}&q=${encodeURIComponent(query)}`).then((res) => {
        if (!ignore && res.ok) setState({ query, results: res.body.data as ProductDto[] });
      });
    }, delayMs);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, delayMs, limit]);

  if (!query) return { results: [], searching: false };
  return state.query === query ? { results: state.results, searching: false } : { results: [], searching: true };
}

/**
 * Seconds left on a countdown started with `start(seconds)`; 0 when idle or finished.
 * The interval is the external system this effect synchronises with, and stops at zero.
 */
export function useCountdown(): [number, (seconds: number) => void] {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endsAt) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const start = (seconds: number) => {
    const t = Date.now();
    setNow(t);
    setEndsAt(t + seconds * 1000);
  };
  return [endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000)), start];
}

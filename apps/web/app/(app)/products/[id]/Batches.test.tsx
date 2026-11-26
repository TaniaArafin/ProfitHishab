import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchDto } from '@ph/shared';
import { plainProduct } from '@/test/products';
import { BatchesCard } from './BatchesCard';
import { ClearStockButton } from '../ClearStockButton';

const api = vi.fn<(method: string, path: string, body?: unknown) => Promise<unknown>>();
vi.mock('@/lib/client-api', () => ({
  api: (method: string, path: string, body?: unknown) => api(method, path, body),
  fieldError: (error: { fields?: Record<string, string[]> } | null, field: string) => error?.fields?.[field]?.[0],
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const napa = plainProduct({
  id: 'napa',
  name: 'Napa 500mg',
  unit: 'strip',
  tracksBatches: true,
  stock: 380,
  expiredStock: 60,
  expiredCost: 48000,
});
const batches: BatchDto[] = [
  {
    id: 'b0',
    variantId: 'napa-v',
    variantLabel: '',
    batchNo: 'NP2510',
    expiresOn: '2026-10-31',
    receivedOn: '2026-05-01',
    quantity: 60,
    unitCost: 800,
    expired: true,
    expiresInDays: -26,
  },
  {
    id: 'b1',
    variantId: 'napa-v',
    variantLabel: '',
    batchNo: 'NP2604',
    expiresOn: '2026-12-31',
    receivedOn: '2026-06-01',
    quantity: 120,
    unitCost: 920,
    expired: false,
    expiresInDays: 35,
  },
  {
    id: 'b2',
    variantId: 'napa-v',
    variantLabel: '',
    batchNo: 'NP2611',
    expiresOn: '2027-06-30',
    receivedOn: '2026-11-01',
    quantity: 200,
    unitCost: 950,
    expired: false,
    expiresInDays: 216,
  },
];

describe('Batches on the product page', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: { quantity: 60, cost: 48000 } });
    refresh.mockReset();
  });

  it('lists batches with their expiry state', () => {
    render(<BatchesCard product={napa} batches={batches} />);
    expect(screen.getAllByText('NP2510').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Expires in 35 days').length).toBeGreaterThan(0);
  });

  it('receives stock into a new batch', async () => {
    render(<BatchesCard product={napa} batches={batches} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive stock' }));
    fireEvent.change(screen.getByLabelText('Batch no'), { target: { value: 'NP2701' } });
    fireEvent.change(screen.getByLabelText('Expiry date'), { target: { value: '2027-12-31' } });
    fireEvent.change(screen.getByLabelText('Quantity (strip)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Cost per strip (৳)'), { target: { value: '9.8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add stock' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('POST', '/products/napa/batches', {
        batchNo: 'NP2701',
        expiresOn: '2027-12-31',
        quantity: 100,
        unitCost: 980,
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('Clear stock asks first, then clears the expired stock', async () => {
    render(<ClearStockButton product={napa} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear stock' }));
    expect(await screen.findByText(/60 strip of expired stock/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear expired stock' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('POST', '/products/napa/clear-expired', undefined));
    expect(refresh).toHaveBeenCalled();
  });
});

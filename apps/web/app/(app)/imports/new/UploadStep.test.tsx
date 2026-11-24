import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportDto } from '@ph/shared';
import type { ApiError } from '@/lib/client-api';
import { UploadStep } from './UploadStep';

type Call = [method: string, path: string, body?: unknown, headers?: unknown, opts?: unknown];
const api = vi.fn<(...args: Call) => Promise<unknown>>();
const upload = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const push = vi.fn();

vi.mock('@/lib/client-api', () => ({
  api: (...args: Call) => api(...args),
  upload: (...args: unknown[]) => upload(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const COLUMNS = { phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price', status: 'Status' };

function uploaded(over: Partial<ImportDto> = {}): ImportDto {
  return {
    id: 'imp1',
    fileName: 'orders.xlsx',
    status: 'uploaded',
    createdAt: '2026-11-12T08:00:00.000Z',
    headers: ['Phone', 'Product', 'Qty', 'Price', 'Status'],
    sampleRows: [],
    mapping: null,
    suggestedColumns: COLUMNS,
    statusValues: [
      { value: 'Delivered', count: 2, suggested: 'delivered' },
      { value: 'Returned', count: 1, suggested: 'returned' },
    ],
    counts: { total: 3, valid: 0, duplicate: 0, invalid: 0, orders: 0 },
    importedOrders: 0,
    missingCostProducts: 0,
    ...over,
  };
}

async function send(imp: ImportDto) {
  upload.mockResolvedValue({ ok: true, data: imp, body: {} });
  render(<UploadStep />);
  fireEvent.change(screen.getByLabelText(/Your file/), { target: { files: [new File(['x'], 'orders.xlsx')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload and review' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/imports/imp1'));
}

const calls = (method: string) => api.mock.calls.filter((c) => c[0] === method);

describe('UploadStep', () => {
  beforeEach(() => {
    upload.mockReset();
    push.mockReset();
    api.mockReset().mockResolvedValue({ ok: true, data: {}, body: {} });
  });

  it('saves the recognised columns and statuses and checks the file, so the preview opens next', async () => {
    await send(uploaded());
    expect(calls('PUT')).toHaveLength(1);
    expect(calls('PUT')[0][2]).toEqual({ columns: COLUMNS, statuses: { Delivered: 'delivered', Returned: 'returned' } });
    expect(calls('POST').map((c) => c[1])).toEqual(['/imports/imp1/validate']);
  });

  it('saves the columns but does not check the file when a status is not recognised', async () => {
    await send(
      uploaded({
        statusValues: [
          { value: 'Delivered', count: 2, suggested: 'delivered' },
          { value: 'Ferot', count: 1, suggested: null },
        ],
      }),
    );
    expect(calls('PUT')[0][2]).toEqual({ columns: COLUMNS });
    expect(calls('POST')).toHaveLength(0);
  });

  it('leaves a file with a missing required column for the seller to match', async () => {
    await send(uploaded({ suggestedColumns: { phone: 'Phone', product: 'Product', sellingPrice: 'Price' }, statusValues: [] }));
    expect(api).not.toHaveBeenCalled();
  });

  it('still opens the import when the automatic check fails', async () => {
    api.mockResolvedValue({ ok: false, status: 0, error: { code: 'network', message: 'Could not reach the server.' } });
    await send(uploaded());
    expect(push).toHaveBeenCalledWith('/imports/imp1');
  });
});

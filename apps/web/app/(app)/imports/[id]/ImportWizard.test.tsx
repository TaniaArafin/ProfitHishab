import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportCommitResultDto, ImportDto, ImportListItemDto, ImportRowDto } from '@ph/shared';
import type { ApiError } from '@/lib/client-api';
import { ImportHistory } from '../ImportHistory';
import { ImportWizard } from './ImportWizard';

type Call = [method: string, path: string, body?: unknown, headers?: unknown, opts?: unknown];
const api = vi.fn<(...args: Call) => Promise<unknown>>();
const refresh = vi.fn();
const push = vi.fn();

vi.mock('@/lib/client-api', () => ({
  api: (...args: Call) => api(...args),
  upload: vi.fn(),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));

const ok = (data: unknown, body: Record<string, unknown> = {}) => Promise.resolve({ ok: true, data, body: { data, ...body } });

const HEADERS = ['Order ID', 'Phone', 'Product', 'Qty', 'Price', 'Status'];
const SAMPLE = { 'Order ID': 'FB-1', Phone: '01712345678', Product: 'Jamdani Saree', Qty: '1', Price: '4500', Status: 'Delivered' };

function makeImport(over: Partial<ImportDto> = {}): ImportDto {
  return {
    id: 'imp1',
    fileName: 'october.xlsx',
    status: 'uploaded',
    createdAt: '2026-11-12T08:00:00.000Z',
    headers: HEADERS,
    sampleRows: [SAMPLE],
    mapping: null,
    suggestedColumns: { externalRef: 'Order ID', phone: 'Phone', product: 'Product', sellingPrice: 'Price' },
    statusValues: [],
    counts: { total: 0, valid: 0, duplicate: 0, invalid: 0, orders: 0 },
    importedOrders: 0,
    missingCostProducts: 0,
    ...over,
  };
}

const VALIDATED = makeImport({
  status: 'validated',
  mapping: {
    columns: { externalRef: 'Order ID', phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price' },
    statuses: {},
  },
  counts: { total: 237, valid: 225, duplicate: 8, invalid: 4, orders: 225 },
});

const ROW: ImportRowDto = { rowNumber: 2, status: 'valid', reasons: [], warnings: [], raw: SAMPLE, problems: {} };

const RESULT: ImportCommitResultDto = {
  ordersCreated: 225,
  customersCreated: 225,
  productsCreated: 8,
  missingCostProducts: 3,
  from: '2026-10-01',
  to: '2026-10-31',
};

function choose(trigger: HTMLElement, option: string) {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: option }));
}

const calls = (method: string, path: string) => api.mock.calls.filter((c) => c[0] === method && c[1] === path);

describe('ImportWizard', () => {
  beforeEach(() => {
    api.mockReset().mockImplementation((method, path) => {
      if (method === 'GET' && path.startsWith('/imports/imp1/rows')) return ok([ROW], { meta: { page: 1, perPage: 25, total: 1 } });
      return ok({});
    });
    refresh.mockReset();
    push.mockReset();
  });

  it('prefills the mapping from suggestions and refuses Continue until quantity is chosen', async () => {
    const mapped = makeImport({ status: 'mapped' });
    const validated = { ...VALIDATED };
    api.mockImplementation((method, path) => {
      if (method === 'PUT' && path === '/imports/imp1/mapping') return ok(mapped);
      if (method === 'POST' && path === '/imports/imp1/validate') return ok(validated);
      if (method === 'GET') return ok([ROW], { meta: { page: 1, perPage: 25, total: 1 } });
      return ok({});
    });
    render(<ImportWizard imp={makeImport()} />);

    expect(screen.getByRole('combobox', { name: /^Phone/ })).toHaveTextContent('Phone');
    expect(screen.getByRole('combobox', { name: /^Selling price/ })).toHaveTextContent('Price');
    expect(screen.getByRole('combobox', { name: /^Order ID/ })).toHaveTextContent('Order ID');
    expect(screen.getByRole('combobox', { name: /^Quantity/ })).toHaveTextContent('Not in my file');
    // The sample rows are shown with the file's own headers.
    expect(screen.getByRole('table', { name: 'First rows of your file' })).toHaveTextContent('Jamdani Saree');

    const proceed = screen.getByRole('button', { name: 'Review orders' });
    expect(proceed).toBeDisabled();
    expect(screen.getByText('Choose a column for: Quantity')).toBeInTheDocument();

    choose(screen.getByRole('combobox', { name: /^Quantity/ }), 'Qty');
    expect(proceed).toBeEnabled();
    fireEvent.click(proceed);

    await screen.findByText('237 rows detected: 225 valid, 8 duplicate, 4 invalid');
    expect(calls('PUT', '/imports/imp1/mapping')[0][2]).toEqual({
      columns: { externalRef: 'Order ID', phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price' },
    });
    // No status column: validate straight away, with the long timeout.
    expect(calls('POST', '/imports/imp1/validate')).toHaveLength(1);
    expect(calls('POST', '/imports/imp1/validate')[0][4]).toEqual({ timeoutMs: 60_000 });
  });

  it('asks how each status text maps when a status column is chosen, then validates', async () => {
    const mapped = makeImport({
      status: 'mapped',
      mapping: { columns: { phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price', status: 'Status' }, statuses: {} },
      statusValues: [
        { value: 'Delivered', count: 200, suggested: 'delivered' },
        { value: 'Ferot', count: 12, suggested: null },
      ],
    });
    api.mockImplementation((method, path) => {
      if (method === 'PUT') return ok(mapped);
      if (method === 'POST' && path === '/imports/imp1/validate') return ok(VALIDATED);
      if (method === 'GET') return ok([ROW], { meta: { total: 1 } });
      return ok({});
    });
    render(
      <ImportWizard
        imp={makeImport({
          suggestedColumns: { phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price', status: 'Status' },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review orders' }));

    const ferot = await screen.findByRole('combobox', { name: '“Ferot” (12 rows)' });
    expect(screen.getByRole('combobox', { name: '“Delivered” (200 rows)' })).toHaveTextContent('Delivered');
    expect(calls('POST', '/imports/imp1/validate')).toHaveLength(0);
    const proceed = screen.getByRole('button', { name: 'Review orders' });
    expect(proceed).toBeDisabled();

    choose(ferot, 'Returned');
    fireEvent.click(proceed);
    await screen.findByText('237 rows detected: 225 valid, 8 duplicate, 4 invalid');
    expect(calls('PUT', '/imports/imp1/mapping')[1][2]).toEqual({
      columns: mapped.mapping!.columns,
      statuses: { Delivered: 'delivered', Ferot: 'returned' },
    });
  });

  it('goes straight to the preview from Continue when every status is recognised', async () => {
    const columns = { phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price', status: 'Status' };
    const mapped = makeImport({
      status: 'mapped',
      mapping: { columns, statuses: {} },
      statusValues: [{ value: 'Delivered', count: 200, suggested: 'delivered' }],
    });
    api.mockImplementation((method, path) => {
      if (method === 'PUT') return ok(mapped);
      if (method === 'POST' && path === '/imports/imp1/validate') return ok(VALIDATED);
      return ok([ROW], { meta: { total: 1 } });
    });
    render(<ImportWizard imp={makeImport({ suggestedColumns: columns })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review orders' }));

    await screen.findByText('237 rows detected: 225 valid, 8 duplicate, 4 invalid');
    expect(screen.queryByText('What do these statuses mean?')).not.toBeInTheDocument();
    expect(calls('PUT', '/imports/imp1/mapping').at(-1)?.[2]).toEqual({ columns, statuses: { Delivered: 'delivered' } });
  });

  it('opens on the status question when the columns are saved but a status is unknown', () => {
    render(
      <ImportWizard
        imp={makeImport({
          status: 'mapped',
          mapping: {
            columns: { phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price', status: 'Status' },
            statuses: {},
          },
          statusValues: [{ value: 'Ferot', count: 12, suggested: null }],
        })}
      />,
    );
    expect(screen.getByText('What do these statuses mean?')).toBeInTheDocument();
  });

  it('shows what was matched on the preview, and Change columns also lets the seller review statuses', async () => {
    const columns = { phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price', status: 'Status' };
    const statusValues = [{ value: 'Delivered', count: 200, suggested: 'delivered' as const }];
    const checked = makeImport({
      status: 'validated',
      mapping: { columns, statuses: { Delivered: 'delivered' } },
      statusValues,
      counts: { total: 200, valid: 200, duplicate: 0, invalid: 0, orders: 200 },
    });
    api.mockImplementation((method) => {
      if (method === 'PUT') return ok({ ...checked, status: 'mapped' });
      return ok([ROW], { meta: { total: 1 } });
    });
    render(<ImportWizard imp={checked} />);

    // One short line instead of the full column list; the full match is on the Change columns step.
    expect(screen.getByText('Columns matched automatically.')).toBeInTheDocument();
    expect(screen.queryByText(/^Matched \d+ columns/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change columns' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review orders' }));
    expect(await screen.findByText('What do these statuses mean?')).toBeInTheDocument();
  });

  describe('fixing a wrong value right in its row', () => {
    const BAD: ImportRowDto = {
      rowNumber: 3,
      status: 'invalid',
      reasons: ['phone_invalid', 'quantity_invalid'],
      warnings: [],
      raw: { ...SAMPLE, Phone: '12345', Qty: 'zero' },
      problems: { phone: 'Enter a number like 017XXXXXXXX', quantity: 'Enter a whole number of 1 or more' },
    };
    const withInvalid = (invalid: number, valid: number) => ({
      ...VALIDATED,
      counts: { total: invalid + valid, valid, duplicate: 0, invalid, orders: valid },
    });
    let invalidRows: ImportRowDto[];

    function serve(edit: () => unknown) {
      invalidRows = [BAD];
      api.mockImplementation((method, path) => {
        if (method === 'PATCH') return edit() as Promise<unknown>;
        if (method === 'GET' && path.includes('status=invalid')) return ok(invalidRows, { meta: { total: invalidRows.length } });
        return ok([ROW], { meta: { total: 1 } });
      });
    }

    /** The table and the phone card both render in jsdom; the first is the table's. */
    const cellInput = async (name: string) => (await screen.findAllByRole('textbox', { name }))[0];

    it('shows each wrong value as a box in its row with the error under it, and nothing else to click', async () => {
      serve(() => ok({}));
      render(<ImportWizard imp={withInvalid(1, 5)} />);
      const phone = await cellInput('Phone, row 3');
      expect(phone).toHaveValue('12345');
      expect(phone).toHaveAttribute('aria-invalid', 'true');
      // The problem is one line under the row, naming the column and the value, across the whole row.
      const message = screen.getByText('Phone “12345”: Enter a number like 017XXXXXXXX');
      expect(message.closest('td')).toHaveAttribute('colspan');
      expect(phone).toHaveAttribute('aria-describedby', message.closest('[id]')?.id);
      expect(await cellInput('Qty, row 3')).toHaveValue('zero');
      // Right values are editable too, but not marked; no Fix button and no pop-up.
      expect(await cellInput('Product, row 3')).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByRole('button', { name: /Fix/ })).not.toBeInTheDocument();
      // Every column of the file shows, under the file's own header; a column not imported says so.
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
      expect(headers).not.toContain('Issue');
      expect(headers).toEqual(expect.arrayContaining(['Row', 'Order ID', 'Phone', 'Product', 'Qty', 'Price', 'Statusnot imported']));
      // One scrollable table on every screen size, with a hint that there is more to the side.
      expect(screen.getAllByRole('table')).toHaveLength(1);
      expect(screen.getByText('Scroll sideways to see all 6 columns.')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('saves a value on Enter, then counts the row as ready', async () => {
      serve(() => {
        invalidRows = [];
        return ok({ import: withInvalid(0, 6), row: { ...BAD, status: 'valid', reasons: [], problems: {} } });
      });
      render(<ImportWizard imp={withInvalid(1, 5)} />);
      const phone = await cellInput('Phone, row 3');
      fireEvent.change(phone, { target: { value: '01912345678' } });
      fireEvent.keyDown(phone, { key: 'Enter' });

      expect(await screen.findByRole('button', { name: 'Import 6 Orders' })).toBeEnabled();
      expect(calls('PATCH', '/imports/imp1/rows/3')[0][2]).toEqual({ cells: { Phone: '01912345678' } });
      expect(screen.getByRole('status')).toHaveTextContent('Row 3 fixed');
      // The row stays where it is: its red border and error go, and it says it is fixed.
      await waitFor(async () => expect(await cellInput('Phone, row 3')).not.toHaveAttribute('aria-invalid'));
      expect(await cellInput('Phone, row 3')).toHaveValue('01912345678');
      expect(screen.queryAllByText(/Enter a number like 017XXXXXXXX/)).toHaveLength(0);
      expect(screen.getAllByText('Fixed, will be imported').length).toBeGreaterThan(0);
    });

    it('saves when the seller leaves the box, but not when nothing changed', async () => {
      serve(() => ok({ import: withInvalid(1, 5), row: BAD }));
      render(<ImportWizard imp={withInvalid(1, 5)} />);
      const phone = await cellInput('Phone, row 3');
      fireEvent.blur(phone);
      expect(calls('PATCH', '/imports/imp1/rows/3')).toHaveLength(0);
      fireEvent.change(phone, { target: { value: '01912345678' } });
      fireEvent.blur(phone);
      await waitFor(() => expect(calls('PATCH', '/imports/imp1/rows/3')).toHaveLength(1));
    });

    it('keeps the other wrong value with its error when one is fixed', async () => {
      const still = { ...BAD, raw: { ...BAD.raw, Phone: '01912345678' }, problems: { quantity: BAD.problems.quantity } };
      serve(() => {
        invalidRows = [still];
        return ok({ import: withInvalid(1, 5), row: still });
      });
      render(<ImportWizard imp={withInvalid(1, 5)} />);
      const phone = await cellInput('Phone, row 3');
      fireEvent.change(phone, { target: { value: '01912345678' } });
      fireEvent.keyDown(phone, { key: 'Enter' });

      await waitFor(async () => expect(await cellInput('Phone, row 3')).not.toHaveAttribute('aria-invalid'));
      expect(await cellInput('Phone, row 3')).toHaveValue('01912345678');
      expect(await cellInput('Qty, row 3')).toHaveValue('zero');
      expect(await cellInput('Qty, row 3')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText('Qty “zero”: Enter a whole number of 1 or more')).toBeInTheDocument();
    });

    it('shows a failed save under the value', async () => {
      serve(() => Promise.resolve({ ok: false, status: 0, error: { code: 'network', message: 'Could not reach the server.' } }));
      render(<ImportWizard imp={withInvalid(1, 5)} />);
      const phone = await cellInput('Phone, row 3');
      fireEvent.change(phone, { target: { value: '01912345678' } });
      fireEvent.keyDown(phone, { key: 'Enter' });
      expect((await screen.findAllByText('Could not reach the server.')).length).toBeGreaterThan(0);
      expect(phone).toHaveValue('01912345678');
    });

    it('lets the seller change any value of a ready row in place too', async () => {
      const READY: ImportRowDto = { ...ROW, rowNumber: 2 };
      api.mockImplementation((method, path) => {
        if (method === 'PATCH') return ok({ import: VALIDATED, row: { ...READY, raw: { ...READY.raw, Qty: '3' } } });
        if (method === 'GET' && path.includes('status=valid')) return ok([READY], { meta: { total: 1 } });
        return ok([], { meta: { total: 0 } });
      });
      render(<ImportWizard imp={{ ...VALIDATED, counts: { total: 1, valid: 1, duplicate: 0, invalid: 0, orders: 1 } }} />);
      const qty = await cellInput('Qty, row 2');
      expect(qty).toHaveValue('1');
      expect(qty).not.toHaveAttribute('aria-invalid');
      fireEvent.change(qty, { target: { value: '3' } });
      fireEvent.keyDown(qty, { key: 'Enter' });
      await waitFor(() => expect(calls('PATCH', '/imports/imp1/rows/2')[0][2]).toEqual({ cells: { Qty: '3' } }));
    });

    it('lets the seller give a duplicate row a new order ID and import it', async () => {
      const DUP: ImportRowDto = {
        ...ROW,
        status: 'duplicate',
        reasons: ['duplicate_ref'],
        problems: { externalRef: 'This order ID is already imported. Enter a new one if this is a different order.' },
      };
      const allDup = { ...VALIDATED, counts: { total: 1, valid: 0, duplicate: 1, invalid: 0, orders: 0 } };
      const ready = { ...VALIDATED, counts: { total: 1, valid: 1, duplicate: 0, invalid: 0, orders: 1 } };
      let duplicates = [DUP];
      api.mockImplementation((method, path) => {
        if (method === 'PATCH') {
          duplicates = [];
          return ok({ import: ready, row: { ...DUP, status: 'valid', reasons: [], problems: {} } });
        }
        if (method === 'GET' && path.includes('status=duplicate')) return ok(duplicates, { meta: { total: duplicates.length } });
        return ok([ROW], { meta: { total: 1 } });
      });
      render(<ImportWizard imp={allDup} />);

      expect(screen.getByRole('heading', { name: 'These orders are already imported' })).toBeInTheDocument();
      const ref = await cellInput('Order ID, row 2');
      expect(ref).toHaveValue('FB-1');
      fireEvent.change(ref, { target: { value: 'FB-2' } });
      fireEvent.keyDown(ref, { key: 'Enter' });

      expect(await screen.findByRole('button', { name: 'Import 1 Order' })).toBeEnabled();
      expect(calls('PATCH', '/imports/imp1/rows/2')[0][2]).toEqual({ cells: { 'Order ID': 'FB-2' } });
    });
  });

  it('shows "Import 225 Orders" and sends one commit on a double click', async () => {
    let finish: (v: unknown) => void = () => {};
    api.mockImplementation((method, path) => {
      if (method === 'POST' && path === '/imports/imp1/commit') return new Promise((resolve) => (finish = resolve));
      return ok([ROW], { meta: { total: 1 } });
    });
    render(<ImportWizard imp={VALIDATED} />);

    expect(screen.getByText('237 rows detected: 225 valid, 8 duplicate, 4 invalid')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Import 225 Orders' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(calls('POST', '/imports/imp1/commit')).toHaveLength(1);
    expect(calls('POST', '/imports/imp1/commit')[0][4]).toEqual({ timeoutMs: 60_000 });

    expect(screen.getByRole('progressbar', { name: 'Creating 225 orders' })).toBeInTheDocument();
    finish({ ok: true, data: RESULT, body: {} });
    await screen.findByText('225 orders imported');
    expect(screen.getByText(/^Done in \d+(\.\d)? s\.$/)).toBeInTheDocument();
    expect(calls('POST', '/imports/imp1/commit')).toHaveLength(1);
  });

  it('shows the missing-cost prompt after import when products lack cost', async () => {
    api.mockImplementation((method, path) => {
      if (method === 'POST' && path === '/imports/imp1/commit') return ok(RESULT);
      return ok([ROW], { meta: { total: 1 } });
    });
    render(<ImportWizard imp={VALIDATED} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import 225 Orders' }));

    expect(await screen.findByText('225 orders imported')).toBeInTheDocument();
    expect(
      screen.getByText('3 products have no cost, so the profit of these imported orders is shown higher than it really is.'),
    ).toBeInTheDocument();
    expect(screen.getByText('A cost you add now counts for new orders only. These imported orders keep a cost of 0.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fix missing costs' })).toHaveAttribute('href', '/products/missing-cost');
    // Plain words for where each button goes.
    expect(screen.getByRole('link', { name: 'View imported orders' })).toHaveAttribute('href', '/orders?from=2026-10-01&to=2026-10-31');
    expect(screen.getByRole('link', { name: 'Import history' })).toHaveAttribute('href', '/imports');
    expect(screen.queryByRole('link', { name: 'All imports' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See profit for 1 Oct 2026 – 31 Oct 2026' })).toHaveAttribute(
      'href',
      '/dashboard?from=2026-10-01&to=2026-10-31',
    );
  });

  it('on import_stale asks to check the file again and re-validates', async () => {
    const message = 'Some orders were added since you checked this file. Check it again.';
    const rechecked = { ...VALIDATED, counts: { total: 237, valid: 224, duplicate: 9, invalid: 4, orders: 224 } };
    api.mockImplementation((method, path) => {
      if (method === 'POST' && path === '/imports/imp1/commit')
        return Promise.resolve({ ok: false, status: 409, error: { code: 'import_stale', message } });
      if (method === 'POST' && path === '/imports/imp1/validate') return ok(rechecked);
      return ok([ROW], { meta: { total: 1 } });
    });
    render(<ImportWizard imp={VALIDATED} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import 225 Orders' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('237 rows detected: 224 valid, 9 duplicate, 4 invalid')).toBeInTheDocument();
    expect(calls('POST', '/imports/imp1/validate')[0][4]).toEqual({ timeoutMs: 60_000 });
    expect(screen.getByRole('button', { name: 'Import 224 Orders' })).toBeEnabled();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('shows import_not_ready as the API says it', async () => {
    api.mockImplementation((method, path) => {
      if (method === 'POST' && path === '/imports/imp1/commit')
        return Promise.resolve({
          ok: false,
          status: 409,
          error: { code: 'import_not_ready', message: 'This import is not ready for that step.' },
        });
      return ok([ROW], { meta: { total: 1 } });
    });
    render(<ImportWizard imp={VALIDATED} />);
    fireEvent.click(screen.getByRole('button', { name: 'Import 225 Orders' }));
    expect(await screen.findByText('This import is not ready for that step.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
  });

  it('shows an undone import as a notice with a way back', () => {
    render(<ImportWizard imp={makeImport({ status: 'undone', importedOrders: 225 })} />);
    expect(screen.getByText('This import was undone. Its orders were deleted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to imports' })).toHaveAttribute('href', '/imports');
  });
});

describe('ImportHistory', () => {
  const item: ImportListItemDto = {
    id: 'imp1',
    fileName: 'october.xlsx',
    status: 'imported',
    createdAt: '2026-11-12T08:00:00.000Z',
    importedOrders: 225,
    canUndo: true,
  };

  beforeEach(() => {
    api.mockReset().mockImplementation(() => ok({ ordersDeleted: 225, customersDeleted: 225, productsDeleted: 8 }));
    refresh.mockReset();
  });

  it('undo asks for confirmation before calling the API', async () => {
    render(<ImportHistory imports={[item]} />);
    // Table (md and up) and card (phone) both render in jsdom; use the first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo october.xlsx' })[0]);

    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'Delete the 225 orders from this import? Customers and products it created are deleted too if no other order uses them, even if you edited them since.',
      ),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo import' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0].slice(0, 2)).toEqual(['POST', '/imports/imp1/undo']);
  });
});

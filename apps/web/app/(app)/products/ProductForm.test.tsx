import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OptionListDto } from '@ph/shared';
import { ProductForm } from './ProductForm';

const api = vi.fn<(method: string, path: string, body?: unknown) => Promise<unknown>>();
vi.mock('@/lib/client-api', () => ({
  api: (method: string, path: string, body?: unknown) => api(method, path, body),
  fieldError: (error: { fields?: Record<string, string[]> } | null, field: string) => error?.fields?.[field]?.[0],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

const lists: OptionListDto[] = [
  { id: 'l1', name: 'Size', values: ['S', 'M', 'L'] },
  { id: 'l2', name: 'Colour', values: ['Red', 'Blue'] },
];

const posted = () => api.mock.calls.find(([method, path]) => method === 'POST' && path === '/products')?.[2] as Record<string, unknown>;

function addValue(option: string, value: string) {
  const input = screen.getByLabelText(`Add a value to ${option}`);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function addOption(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
  const inputs = screen.getAllByLabelText(/^Option \d name$/);
  fireEvent.change(inputs[inputs.length - 1], { target: { value: name } });
}

describe('ProductForm', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: { id: 'p1' } });
  });

  it('a plain product shows price, cost and stock, no variants, and sends the plain body', async () => {
    render(<ProductForm categories={[]} />);
    expect(screen.queryByText(/^Variants/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Gift Box' } });
    fireEvent.change(screen.getByLabelText('Selling price (৳)'), { target: { value: '350' } });
    fireEvent.change(screen.getByLabelText('Product cost (৳)'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    await waitFor(() => expect(posted()).toBeDefined());
    expect(posted()).toMatchObject({ name: 'Gift Box', unit: 'piece', sellingPrice: 35000, costPrice: 12000, stock: 40 });
    expect(posted()).not.toHaveProperty('variants');
  });

  it('builds variants from options, fills them with Set all, and sends them in poisha', async () => {
    render(<ProductForm categories={[]} />);
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Cotton Kurti' } });
    addOption('Size');
    addValue('Size', 'S');
    addValue('Size', 'M');
    addOption('Colour');
    addValue('Colour', 'Red');

    expect(screen.getByText('Variants (2)')).toBeInTheDocument();
    expect(screen.getByLabelText('Price for S / Red')).toBeInTheDocument();
    expect(screen.getByLabelText('Price for M / Red')).toBeInTheDocument();
    expect(screen.queryByLabelText('Selling price (৳)')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Price for all'), { target: { value: '1250' } });
    fireEvent.change(screen.getByLabelText('Cost for all'), { target: { value: '700' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByLabelText('Price for M / Red')).toHaveValue('1250');
    fireEvent.change(screen.getByLabelText('Stock for M / Red'), { target: { value: '14' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    await waitFor(() => expect(posted()).toBeDefined());
    expect(posted()).toMatchObject({
      options: [
        { name: 'Size', values: ['S', 'M'] },
        { name: 'Colour', values: ['Red'] },
      ],
      variants: [
        { optionValues: { Size: 'S', Colour: 'Red' }, sellingPrice: 125000, costPrice: 70000, stock: 0, status: 'active' },
        { optionValues: { Size: 'M', Colour: 'Red' }, sellingPrice: 125000, costPrice: 70000, stock: 14, status: 'active' },
      ],
    });
    expect(posted()).not.toHaveProperty('sellingPrice');
  });

  it('removing a value removes its variant rows', () => {
    render(<ProductForm categories={[]} />);
    addOption('Size');
    addValue('Size', 'S');
    addValue('Size', 'M');
    fireEvent.click(screen.getByRole('button', { name: 'Remove M from Size' }));
    expect(screen.queryByLabelText('Price for M')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Price for S')).toBeInTheDocument();
  });

  it('fills an option from a saved list', () => {
    render(<ProductForm categories={[]} optionLists={lists} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use saved list Size' }));
    expect(screen.getByText('Variants (3)')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Size values' })).getAllByRole('button', { name: /^Remove/ })).toHaveLength(3);
  });

  it('suggests the option names of the business type', () => {
    render(<ProductForm categories={[]} businessType="Clothing & fashion" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Size' }));
    expect(screen.getByLabelText('Option 1 name')).toHaveValue('Size');
  });

  it("shows a variant's SKU error under that row", async () => {
    api.mockResolvedValue({
      ok: false,
      error: { code: 'sku_taken', message: 'SKU KUR-M is already used.', fields: { 'variants.1.sku': ['SKU KUR-M is already used.'] } },
    });
    render(<ProductForm categories={[]} />);
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Kurti' } });
    addOption('Size');
    addValue('Size', 'S');
    addValue('Size', 'M');
    fireEvent.change(screen.getByLabelText('Price for all'), { target: { value: '1250' } });
    fireEvent.change(screen.getByLabelText('Cost for all'), { target: { value: '700' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    expect(await screen.findByText('SKU KUR-M is already used.')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU for M')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a grocery product is priced per kg', () => {
    render(<ProductForm categories={[]} businessType="Food & grocery" />);
    expect(screen.getByLabelText('Price per kg (৳)')).toBeInTheDocument();
    // Grocery tracks expiry by default; without it the stock is typed here.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Track expiry dates (batches)' }));
    expect(screen.getByLabelText('Stock (kg)')).toBeInTheDocument();
  });

  it('opens More options for brand, description and details', () => {
    render(<ProductForm categories={[]} businessType="Clothing & fashion" />);
    fireEvent.click(screen.getByRole('button', { name: /More options/ }));
    expect(screen.getByLabelText('Brand')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Material' }));
    expect(screen.getByLabelText('Detail 1 label')).toHaveValue('Material');
  });

  it('a medicine product tracks expiry by default and gets stock through Receive stock', async () => {
    render(<ProductForm categories={[]} businessType="Medical & pharmacy" />);
    expect(screen.getByRole('checkbox', { name: 'Track expiry dates (batches)' })).toBeChecked();
    expect(screen.queryByLabelText('Stock (strip)')).not.toBeInTheDocument();
    expect(screen.getByText(/Add stock with Receive stock/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Napa 500mg' } });
    fireEvent.change(screen.getByLabelText('Price per strip (৳)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Cost per strip (৳)'), { target: { value: '9.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    await waitFor(() => expect(posted()).toBeDefined());
    expect(posted()).toMatchObject({ name: 'Napa 500mg', unit: 'strip', tracksBatches: true, sellingPrice: 1200, costPrice: 950 });
  });
});

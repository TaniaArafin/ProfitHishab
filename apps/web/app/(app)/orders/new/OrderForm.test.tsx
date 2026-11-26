import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessDto, ProductDto } from '@ph/shared';
import { kurti, plainProduct, rice } from '@/test/products';
import { OrderForm } from './OrderForm';

const saree: ProductDto = plainProduct({
  id: '018f0000-0000-7000-8000-000000000001',
  name: 'Cotton Saree',
  sku: 'SAR-0001',
  sellingPrice: 50000, // ৳500 today
  costPrice: 32000,
  grossProfit: 18000,
  margin: 36,
});
const sareeVariant = saree.variants[0].id;
let found: ProductDto[] = [saree];

const business: BusinessDto = {
  id: 'b1',
  name: 'Shop',
  logoUrl: null,
  phone: null,
  address: null,
  city: null,
  businessType: null,
  facebookPageUrl: null,
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  defaultCourierId: null,
  defaultCourierCost: 0,
  defaultReturnCost: 0,
  defaultPackagingCost: 0,
  trialEndsAt: null,
  firstPaidAt: null,
};

const api = vi.fn<(method: string, path: string, body?: unknown) => Promise<unknown>>();
vi.mock('@/lib/client-api', () => ({
  api: (method: string, path: string, body?: unknown) => api(method, path, body),
  fieldError: () => undefined,
}));
vi.mock('@/lib/hooks', () => ({
  useCustomerLookup: () => undefined,
  useProductSearch: (term: string) => ({ results: term.trim() ? found : [], searching: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

function pick(option: RegExp) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Add product' }), { target: { value: 'x' } });
  fireEvent.mouseDown(screen.getByRole('option', { name: option }));
}
const addSaree = () => pick(/Cotton Saree/);

const postedItems = () => {
  const call = api.mock.calls.find(([method, path]) => method === 'POST' && path === '/orders');
  return (call?.[2] as { items: unknown[] }).items;
};

describe('OrderForm pricing', () => {
  beforeEach(() => {
    found = [saree];
    api.mockReset().mockImplementation((method, path) => {
      if (path.startsWith('/products/prices-on')) {
        // ৳450 / ৳300 was the price on 10 Oct.
        return Promise.resolve({
          ok: true,
          data: [{ variantId: sareeVariant, productId: saree.id, sellingPrice: 45000, costPrice: 30000 }],
        });
      }
      return Promise.resolve({ ok: true, data: { id: 'o1' } });
    });
    render(<OrderForm business={business} couriers={[]} today="2026-10-18" initialPhone="01712345678" />);
  });

  it("uses today's price, and leaves an untouched price for the API to set", async () => {
    addSaree();
    expect(screen.getByLabelText('Price (৳)')).toHaveValue('500');
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(postedItems()).toEqual([{ variantId: sareeVariant, quantity: 1 }]));
  });

  it('reprices to the old price when the order is backdated', async () => {
    addSaree();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Order date'), { target: { value: '2026-10-10' } });
      await Promise.resolve(); // let the price lookup settle
    });
    expect(api).toHaveBeenCalledWith('GET', `/products/prices-on?variantIds=${sareeVariant}&date=2026-10-10`, undefined);
    expect(screen.getByLabelText('Price (৳)')).toHaveValue('450');
    expect(screen.getByText(/cost ৳300/)).toBeInTheDocument();
  });

  it('keeps and sends a price the seller typed, even after the date changes', async () => {
    addSaree();
    fireEvent.change(screen.getByLabelText('Price (৳)'), { target: { value: '480' } });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Order date'), { target: { value: '2026-10-10' } });
      await Promise.resolve(); // let the price lookup settle
    });
    expect(screen.getByLabelText('Price (৳)')).toHaveValue('480');

    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(postedItems()).toEqual([{ variantId: sareeVariant, quantity: 1, unitPrice: 48000 }]));
  });

  it('adds a variant line with its label and sends its variantId', async () => {
    found = [kurti];
    pick(/M \/ Red/);
    expect(screen.getByText('Cotton Kurti — M / Red')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(postedItems()).toEqual([{ variantId: 'kurti-m-red', quantity: 1 }]));
  });

  it('takes 2.5 kg of rice and shows ৳195', async () => {
    found = [rice];
    pick(/Miniket Rice/);
    fireEvent.change(screen.getByLabelText('Qty (kg)'), { target: { value: '2.5' } });
    expect(screen.getAllByText('৳195').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(postedItems()).toEqual([{ variantId: 'rice-v', quantity: 2.5 }]));
  });

  it('asks for a whole number for a piece product and does not send', () => {
    addSaree();
    fireEvent.change(screen.getByLabelText('Qty'), { target: { value: '1.5' } });
    expect(screen.getByText('Use a whole number')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    expect(api.mock.calls.some(([method, path]) => method === 'POST' && path === '/orders')).toBe(false);
  });
});

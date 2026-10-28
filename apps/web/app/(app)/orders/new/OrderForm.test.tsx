import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessDto, ProductDto } from '@ph/shared';
import { OrderForm } from './OrderForm';

const saree: ProductDto = {
  id: '018f0000-0000-7000-8000-000000000001',
  name: 'Cotton Saree',
  sku: 'SAR-0001',
  categoryId: null,
  categoryName: null,
  sellingPrice: 50000, // ৳500 today
  costPrice: 32000,
  grossProfit: 18000,
  margin: 36,
  stock: 10,
  status: 'active',
  costMissing: false,
};

const business: BusinessDto = {
  id: 'b1',
  name: 'Shop',
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
};

const api = vi.fn<(method: string, path: string, body?: unknown) => Promise<unknown>>();
vi.mock('@/lib/client-api', () => ({
  api: (method: string, path: string, body?: unknown) => api(method, path, body),
  fieldError: () => undefined,
}));
vi.mock('@/lib/hooks', () => ({
  useCustomerLookup: () => undefined,
  useProductSearch: (term: string) => ({ results: term.trim() ? [saree] : [], searching: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

function addSaree() {
  fireEvent.change(screen.getByRole('combobox', { name: 'Add product' }), { target: { value: 'saree' } });
  fireEvent.mouseDown(screen.getByRole('option', { name: /Cotton Saree/ }));
}

const postedItems = () => {
  const call = api.mock.calls.find(([method, path]) => method === 'POST' && path === '/orders');
  return (call?.[2] as { items: unknown[] }).items;
};

describe('OrderForm pricing', () => {
  beforeEach(() => {
    api.mockReset().mockImplementation((method, path) => {
      if (path.startsWith('/products/prices-on')) {
        // ৳450 / ৳300 was the price on 10 Oct.
        return Promise.resolve({ ok: true, data: [{ productId: saree.id, sellingPrice: 45000, costPrice: 30000 }] });
      }
      return Promise.resolve({ ok: true, data: { id: 'o1' } });
    });
    render(<OrderForm business={business} couriers={[]} today="2026-10-18" initialPhone="01712345678" />);
  });

  it("uses today's price, and leaves an untouched price for the API to set", async () => {
    addSaree();
    expect(screen.getByLabelText('Price (৳)')).toHaveValue('500');
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(postedItems()).toEqual([{ productId: saree.id, quantity: 1 }]));
  });

  it('reprices to the old price when the order is backdated', async () => {
    addSaree();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Order date'), { target: { value: '2026-10-10' } });
      await Promise.resolve(); // let the price lookup settle
    });
    expect(api).toHaveBeenCalledWith('GET', `/products/prices-on?ids=${saree.id}&date=2026-10-10`, undefined);
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
    await waitFor(() => expect(postedItems()).toEqual([{ productId: saree.id, quantity: 1, unitPrice: 48000 }]));
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusChanger } from './StatusChanger';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const refresh = vi.fn();

vi.mock('@/lib/client-api', () => ({ api: (...args: unknown[]) => api(...args) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('StatusChanger', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: {}, body: {} });
    refresh.mockReset();
  });

  it('asks for confirmation before cancelling, and does nothing if the seller backs out', () => {
    render(<StatusChanger orderId="o1" status="shipped" allowed={['delivered', 'cancelled', 'returned']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));

    expect(screen.getByText(/Stock goes back on the shelf/)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep shipped' }));
    expect(api).not.toHaveBeenCalled();
  });

  it('cancels after confirmation and refreshes the page', async () => {
    render(<StatusChanger orderId="o1" status="shipped" allowed={['delivered', 'cancelled']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark cancelled' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('POST', '/orders/o1/status', { status: 'cancelled' });
  });

  it('moves forward without a confirmation step', async () => {
    render(<StatusChanger orderId="o1" status="shipped" allowed={['delivered']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delivered' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('POST', '/orders/o1/status', { status: 'delivered' }));
  });

  it('shows the server message when the change is refused', async () => {
    api.mockResolvedValue({ ok: false, status: 422, error: { code: 'cannot_cancel', message: "A delivered order can't be cancelled." } });
    render(<StatusChanger orderId="o1" status="new" allowed={['delivered']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delivered' }));
    expect(await screen.findByText("A delivered order can't be cancelled.")).toBeInTheDocument();
  });
});

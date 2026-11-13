import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminPaymentDto } from '@ph/shared';
import type { ApiError } from '@/lib/client-api';
import { PaymentReview } from './PaymentReview';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const refresh = vi.fn();

vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const payment: AdminPaymentDto = {
  id: 'p1',
  method: 'bkash',
  senderNumber: '01712345678',
  transactionId: '8N7A6D5C4B',
  months: 3,
  amount: 149700,
  status: 'pending',
  rejectReason: null,
  createdAt: '2026-11-10T08:00:00.000Z',
  reviewedAt: null,
  periodTo: null,
  business: { id: 'b1', name: 'Rina Fashion' },
  submittedBy: 'Rina',
  reviewedBy: null,
};

describe('PaymentReview', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: {}, body: {} });
    refresh.mockReset();
  });

  it('confirm asks first, then calls POST /admin/payments/{id}/confirm once', async () => {
    render(<PaymentReview payment={payment} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByText(
        'Confirm ৳1,497 from 01712345678 (TrxID 8N7A6D5C4B)? This adds 90 days of access. Check your bKash statement first.',
      ),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('POST', '/admin/payments/p1/confirm');
  });

  it('reject needs a reason and sends it', async () => {
    render(<PaymentReview payment={payment} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const send = await screen.findByRole('button', { name: 'Reject payment' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'No such TrxID' } });
    fireEvent.click(send);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('POST', '/admin/payments/p1/reject', { reason: 'No such TrxID' });
  });

  it('shows a 409 to the admin and does not refresh', async () => {
    api.mockResolvedValue({ ok: false, error: { code: 'payment_already_reviewed', message: 'This payment was already reviewed.' } });
    render(<PaymentReview payment={payment} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm payment' }));
    expect(await screen.findByText('This payment was already reviewed.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('buttons are disabled while the request runs', async () => {
    let finish: (v: unknown) => void = () => {};
    api.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<PaymentReview payment={payment} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    const go = await screen.findByRole('button', { name: 'Confirm payment' });
    fireEvent.click(go);
    fireEvent.click(go);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled());
    expect(api).toHaveBeenCalledTimes(1);
    finish({ ok: true, data: {}, body: {} });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows no actions for a reviewed payment', () => {
    render(<PaymentReview payment={{ ...payment, status: 'confirmed' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

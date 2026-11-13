import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/client-api';
import { PaymentForm } from './PaymentForm';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const refresh = vi.fn();

vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const BOTH = [
  { method: 'bkash' as const, number: '01711111111' },
  { method: 'nagad' as const, number: '01822222222' },
];

function choose(label: string, option: string) {
  fireEvent.keyDown(screen.getByLabelText(label), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: option }));
}

function setup(methods = BOTH) {
  return render(<PaymentForm methods={methods} pricePerMonth={49900} monthOptions={[1, 3, 6, 12]} />);
}

describe('PaymentForm', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: {}, body: {} });
    refresh.mockReset();
  });

  it('shows the amount for the chosen months', () => {
    setup();
    expect(screen.getByText(/send ৳499 to 01711111111/)).toBeInTheDocument();
    choose('How many months', '3 months — ৳1,497');
    expect(screen.getByText(/send ৳1,497 to 01711111111/)).toBeInTheDocument();
  });

  it('sends method, months, senderNumber, transactionId to POST /billing/payments', async () => {
    setup();
    choose('How many months', '3 months — ৳1,497');
    choose('Paid with', 'Nagad');
    fireEvent.change(screen.getByLabelText('Your bKash/Nagad number'), { target: { value: '01955555555' } });
    fireEvent.change(screen.getByLabelText('Transaction ID (TrxID)'), { target: { value: '8n7a6d5c4b' } });
    fireEvent.click(screen.getByRole('button', { name: 'I have paid' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('POST', '/billing/payments', {
      method: 'nagad',
      months: 3,
      senderNumber: '01955555555',
      transactionId: '8n7a6d5c4b',
    });
  });

  it('shows the field error from the API under Transaction ID', async () => {
    api.mockResolvedValue({
      ok: false,
      error: {
        status: 409,
        code: 'transaction_used',
        message: 'This transaction ID was already used.',
        fields: { transactionId: ['This transaction ID was already used.'] },
      },
    });
    setup();
    fireEvent.change(screen.getByLabelText('Transaction ID (TrxID)'), { target: { value: 'ABCDEFGH12' } });
    fireEvent.click(screen.getByRole('button', { name: 'I have paid' }));
    expect(await screen.findByText('This transaction ID was already used.')).toBeInTheDocument();
    expect(screen.getByLabelText('Transaction ID (TrxID)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Transaction ID (TrxID)')).toHaveAccessibleDescription('This transaction ID was already used.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('only offers configured methods', () => {
    setup([BOTH[1]]);
    expect(screen.getByText(/send ৳499 to 01822222222/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Paid with'), { key: 'Enter' });
    expect(screen.getByRole('option', { name: 'Nagad' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'bKash' })).not.toBeInTheDocument();
  });
});

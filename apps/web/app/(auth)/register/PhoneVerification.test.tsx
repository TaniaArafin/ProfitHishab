import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/client-api';
import { PhoneVerification } from './PhoneVerification';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));

describe('PhoneVerification', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: { expiresIn: 600, resendIn: 60 }, body: {} });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a code to the number, then asks for it and blocks resending for a minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<PhoneVerification error={null} />);
    expect(screen.queryByLabelText('SMS code')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '01712345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByLabelText('SMS code')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('POST', '/auth/otp', { phone: '01712345678' });
    expect(screen.getByRole('button', { name: /Resend in \d+s/ })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
  });

  it('shows why a code could not be sent, under the number', async () => {
    api.mockResolvedValue({
      ok: false,
      status: 409,
      error: { code: 'phone_taken', message: 'Already registered.', fields: { phone: ['Already registered.'] } },
    });
    render(<PhoneVerification error={null} />);
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '01712345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() => expect(screen.getByText('Already registered.')).toBeInTheDocument());
    expect(screen.queryByLabelText('SMS code')).not.toBeInTheDocument();
  });

  it('asks for a code first when the form was submitted without one', () => {
    const error = { code: 'validation_failed', message: 'x', fields: { code: ['Enter the 6-digit code'] } };
    render(<PhoneVerification error={error} />);
    expect(screen.getByText('Send a code to this number first.')).toBeInTheDocument();
  });
});

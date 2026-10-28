import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/client-api';
import { ForgotPasswordForm } from './ForgotPasswordForm';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: { ok: true }, body: {} });
  });

  it('asks for a link and says it was sent, without saying whether the account exists', async () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' nusrat@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('POST', '/auth/password/forgot', { email: 'nusrat@example.com' });
    expect(screen.getByRole('status')).toHaveTextContent(/If an account uses nusrat@example.com/);
  });

  it('shows a bad email under the field', async () => {
    api.mockResolvedValue({
      ok: false,
      status: 422,
      error: { code: 'validation_failed', message: 'x', fields: { email: ['Enter a valid email'] } },
    });
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/client-api';
import { ChangePasswordForm } from './ChangePasswordForm';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));

function fill(current: string, next: string) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordForm', () => {
  beforeEach(() => api.mockReset());

  it('shows a wrong current password under that field', async () => {
    const message = 'Your current password is not right.';
    api.mockResolvedValue({ ok: false, status: 422, error: { code: 'wrong_password', message, fields: { currentPassword: [message] } } });
    render(<ChangePasswordForm />);
    fill('nope', 'new-pass-123');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears both fields and confirms that other devices were logged out', async () => {
    api.mockResolvedValue({ ok: true, data: { ok: true }, body: {} });
    render(<ChangePasswordForm />);
    fill('secret-pass-1', 'new-pass-123');
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('POST', '/auth/password/change', { currentPassword: 'secret-pass-1', newPassword: 'new-pass-123' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed. Other devices were logged out.');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/client-api';
import { ResetPasswordForm } from './ResetPasswordForm';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const push = vi.fn();

vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function fill(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: { ok: true }, body: {} });
    push.mockReset();
  });

  it('saves the new password with the token, then sends the seller to log in', async () => {
    render(<ResetPasswordForm token="tok-123456789012345678901" />);
    fill('brand-new-pass', 'brand-new-pass');

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?reset=1'));
    expect(api).toHaveBeenCalledWith('POST', '/auth/password/reset', { token: 'tok-123456789012345678901', password: 'brand-new-pass' });
  });

  it('stops when the two passwords differ, without calling the API', () => {
    render(<ResetPasswordForm token="tok-123456789012345678901" />);
    fill('brand-new-pass', 'brand-new-pas');
    expect(screen.getByText('The two passwords are different.')).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('offers a new link when the link expired or was used', async () => {
    api.mockResolvedValue({
      ok: false,
      status: 422,
      error: {
        code: 'reset_link_invalid',
        message: 'This reset link has expired or was already used. Ask for a new one.',
        fields: { token: ['x'] },
      },
    });
    render(<ResetPasswordForm token="tok-123456789012345678901" />);
    fill('brand-new-pass', 'brand-new-pass');

    expect(await screen.findByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByText(/expired or was already used/)).toBeInTheDocument();
  });

  it('explains a link without a token', () => {
    render(<ResetPasswordForm token="" />);
    expect(screen.getByText(/not complete/)).toBeInTheDocument();
  });
});

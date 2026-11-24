import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/client-api';
import { AccountForm } from './AccountForm';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));

const user = { id: 'u1', name: 'Nusrat', email: 'nusrat@example.com', phone: '01712345678', locale: 'bn', isPlatformAdmin: false };

describe('AccountForm', () => {
  beforeEach(() => {
    api.mockReset();
    refresh.mockReset();
  });

  it('sends name, email and phone and says it saved', async () => {
    api.mockResolvedValue({ ok: true, data: user, body: {} });
    render(<AccountForm user={user} emailRequired />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Nusrat Jahan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save account' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('PATCH', '/auth/me', { name: 'Nusrat Jahan', email: 'nusrat@example.com', phone: '01712345678' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Account saved.');
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a taken email under the Email field', async () => {
    const message = 'This email is already registered. Log in instead.';
    api.mockResolvedValue({ ok: false, status: 409, error: { code: 'email_taken', message, fields: { email: [message] } } });
    render(<AccountForm user={user} emailRequired />);
    fireEvent.click(screen.getByRole('button', { name: 'Save account' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
  });
});

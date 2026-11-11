import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/client-api';
import { AccessForm } from './AccessForm';
import { BlockControls } from './BlockControls';
import { ResetLinkButton } from './ResetLinkButton';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const refresh = vi.fn();

vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

function choose(label: string, option: string) {
  fireEvent.keyDown(screen.getByLabelText(label), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('AccessForm', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: {}, body: {} });
    refresh.mockReset();
  });

  it('adds days and refreshes the page', async () => {
    render(<AccessForm businessId="b1" />);
    fireEvent.change(screen.getByLabelText('Days to add'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add days' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('POST', '/admin/businesses/b1/access', { mode: 'extend', days: 14 });
    expect(screen.getByRole('status')).toHaveTextContent('Access updated.');
  });

  it('sets an end date', async () => {
    render(<AccessForm businessId="b1" />);
    choose('Change access', 'Until a date');
    fireEvent.change(screen.getByLabelText('Last day (Dhaka time)'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set end date' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('POST', '/admin/businesses/b1/access', { mode: 'until', date: '2026-12-31' }));
  });

  it('asks before ending access, and does nothing if the admin backs out', async () => {
    render(<AccessForm businessId="b1" />);
    choose('Change access', 'End access now');
    fireEvent.click(screen.getByRole('button', { name: 'End access now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep access' }));
    expect(api).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'End access now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'End access' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('POST', '/admin/businesses/b1/access', { mode: 'end' }));
  });

  it('shows a bad number of days under the field', async () => {
    api.mockResolvedValue({
      ok: false,
      status: 422,
      error: { code: 'validation_failed', message: 'x', fields: { days: ['At least 1 day'] } },
    });
    render(<AccessForm businessId="b1" />);
    fireEvent.change(screen.getByLabelText('Days to add'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add days' }));
    expect(await screen.findByText('At least 1 day')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('BlockControls', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: {}, body: {} });
    refresh.mockReset();
  });

  it('blocks only after a reason and a confirmation', async () => {
    render(<BlockControls businessId="b1" blocked={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Block account' }));
    fireEvent.change(await screen.findByLabelText('Reason'), { target: { value: 'Fake orders' } });
    fireEvent.click(screen.getByRole('button', { name: 'Block and log out' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith('POST', '/admin/businesses/b1/block', { reason: 'Fake orders' });
  });

  it('unblocks a blocked business', async () => {
    render(<BlockControls businessId="b1" blocked />);
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('POST', '/admin/businesses/b1/unblock', undefined));
  });
});

describe('ResetLinkButton', () => {
  it('shows the new link to copy and when it stops working', async () => {
    api.mockReset().mockResolvedValue({
      ok: true,
      data: { url: 'http://localhost:3000/reset-password?token=abc', expiresAt: '2026-11-06T11:00:00.000Z' },
      body: {},
    });
    render(<ResetLinkButton businessId="b1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create password link' }));

    expect(await screen.findByLabelText('Password link')).toHaveValue('http://localhost:3000/reset-password?token=abc');
    expect(screen.getByRole('status')).toHaveTextContent('Works once, until 6 Nov 2026');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a new link' })).toBeInTheDocument();
  });
});

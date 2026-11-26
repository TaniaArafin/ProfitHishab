import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OptionListDto } from '@ph/shared';
import { OptionLists } from './OptionLists';

const api = vi.fn<(method: string, path: string, body?: unknown) => Promise<unknown>>();
vi.mock('@/lib/client-api', () => ({
  api: (method: string, path: string, body?: unknown) => api(method, path, body),
  fieldError: (error: { fields?: Record<string, string[]> } | null, field: string) => error?.fields?.[field]?.[0],
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const lists: OptionListDto[] = [{ id: 'l1', name: 'Size', values: ['S', 'M', 'L'] }];

describe('OptionLists (Settings → Product options)', () => {
  beforeEach(() => {
    api.mockReset().mockResolvedValue({ ok: true, data: { id: 'l2', name: 'Shoe size', values: ['36', '37'] } });
    refresh.mockReset();
  });

  it('shows each list with its values', () => {
    render(<OptionLists lists={lists} />);
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('S, M, L')).toBeInTheDocument();
  });

  it('adds a list with values typed as chips', async () => {
    render(<OptionLists lists={lists} />);
    fireEvent.click(screen.getByRole('button', { name: 'New option list' }));
    fireEvent.change(screen.getByLabelText('List name'), { target: { value: 'Shoe size' } });
    const values = screen.getByLabelText('Add a value');
    fireEvent.change(values, { target: { value: '36' } });
    fireEvent.keyDown(values, { key: 'Enter' });
    fireEvent.change(values, { target: { value: '37' } });
    fireEvent.keyDown(values, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save list' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('POST', '/option-lists', { name: 'Shoe size', values: ['36', '37'] }));
    expect(refresh).toHaveBeenCalled();
  });

  it('deletes a list after confirming', async () => {
    render(<OptionLists lists={lists} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Size' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete list' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('DELETE', '/option-lists/l1', undefined));
  });
});

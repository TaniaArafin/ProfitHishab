import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoUpload } from './LogoUpload';

const api = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const upload = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/client-api', () => ({
  api: (...args: unknown[]) => api(...args),
  upload: (...args: unknown[]) => upload(...args),
}));

const file = (bytes: number, name = 'logo.png') => new File([new Uint8Array(bytes)], name, { type: 'image/png' });

describe('LogoUpload', () => {
  beforeEach(() => {
    api.mockReset();
    upload.mockReset();
    refresh.mockReset();
  });

  it('refuses a file over 2 MB before sending anything', () => {
    render(<LogoUpload logoUrl={null} />);
    fireEvent.change(screen.getByLabelText('Upload logo'), { target: { files: [file(2 * 1024 * 1024 + 1)] } });
    expect(screen.getByRole('alert')).toHaveTextContent('The logo must be 2 MB or smaller.');
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads the chosen image and refreshes the page', async () => {
    upload.mockResolvedValue({ ok: true, data: { logoUrl: '/api/business/logo?v=1' }, body: {} });
    render(<LogoUpload logoUrl={null} />);
    const chosen = file(1000);
    fireEvent.change(screen.getByLabelText('Upload logo'), { target: { files: [chosen] } });
    await waitFor(() => expect(upload).toHaveBeenCalledWith('/business/logo', chosen));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the API message when the image is refused', async () => {
    upload.mockResolvedValue({ ok: false, status: 415, error: { code: 'logo_unsupported', message: 'Use a PNG, JPG or WebP image.' } });
    render(<LogoUpload logoUrl={null} />);
    fireEvent.change(screen.getByLabelText('Upload logo'), { target: { files: [file(1000)] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a PNG, JPG or WebP image.');
  });

  it('removes the logo only after confirming', async () => {
    api.mockResolvedValue({ ok: true, data: { logoUrl: null }, body: {} });
    render(<LogoUpload logoUrl="/api/business/logo?v=1" />);
    expect(screen.getByRole('img', { name: 'Business logo' })).toHaveAttribute('src', '/api/business/logo?v=1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('DELETE', '/business/logo'));
    expect(refresh).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportUploadDialog } from './ImportUploadDialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/client-api', () => ({ api: vi.fn(), upload: vi.fn(), fieldError: () => undefined }));

describe('ImportUploadDialog', () => {
  it('opens the upload in a pop-up from the Import orders button', () => {
    render(<ImportUploadDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import orders' }));
    const dialog = screen.getByRole('dialog', { name: 'Import orders' });
    expect(dialog).toContainElement(screen.getByLabelText(/Your file/));
    expect(screen.getByRole('button', { name: 'Upload and review' })).toBeDisabled();
  });

  it('starts open when the page asks for it (a link to /imports/new)', () => {
    render(<ImportUploadDialog defaultOpen />);
    expect(screen.getByRole('dialog', { name: 'Import orders' })).toBeInTheDocument();
  });
});

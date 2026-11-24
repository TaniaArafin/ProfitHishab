import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImportBusy } from './ImportBusy';

describe('ImportBusy', () => {
  it('shows the upload share as a real percentage', () => {
    render(<ImportBusy step="upload" uploaded={0.42} />);
    const bar = screen.getByRole('progressbar', { name: 'Uploading your file' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('marks the steps already done and the one in progress', () => {
    render(<ImportBusy step="check" />);
    expect(screen.getByText('Upload file').closest('li')).toHaveAttribute('data-state', 'done');
    expect(screen.getByText('Read your file').closest('li')).toHaveAttribute('data-state', 'done');
    expect(screen.getByText('Check every row').closest('li')).toHaveAttribute('aria-current', 'step');
    // No percentage is known for this step, so the bar moves without claiming one.
    expect(screen.getByRole('progressbar', { name: 'Check every row' })).not.toHaveAttribute('aria-valuenow');
  });

  it('shows creating orders on its own while importing', () => {
    render(<ImportBusy step="import" orders={225} />);
    expect(screen.getByRole('progressbar', { name: 'Creating 225 orders' })).toBeInTheDocument();
  });
});

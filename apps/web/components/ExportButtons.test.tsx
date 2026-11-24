import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExportButtons } from './ExportButtons';

describe('ExportButtons', () => {
  it('links to the CSV and the Excel download of the same report', () => {
    render(<ExportButtons href="/api/reports/expenses?to=2026-10" />);
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/api/reports/expenses?to=2026-10&format=csv');
    expect(screen.getByRole('link', { name: 'Export Excel' })).toHaveAttribute('href', '/api/reports/expenses?to=2026-10&format=xlsx');
  });

  it('adds the format with ? when the report has no query yet', () => {
    render(<ExportButtons href="/api/reports/monthly-profit" />);
    expect(screen.getByRole('link', { name: 'Export Excel' })).toHaveAttribute('href', '/api/reports/monthly-profit?format=xlsx');
  });
});

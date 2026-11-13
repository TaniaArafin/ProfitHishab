import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialBanner } from './TrialBanner';

const NOW = new Date('2026-11-11T10:00:00Z');

describe('TrialBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

  it('counts the days left and links to billing', () => {
    render(<TrialBanner trialEndsAt={inDays(2)} />);
    expect(screen.getByText('Your free trial ends in 2 days.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pay now' })).toHaveAttribute('href', '/billing');
    // A polite status, not an alert: it shows on every page.
    expect(screen.getByRole('status')).toHaveTextContent('Your free trial ends in 2 days.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the singular for one day', () => {
    render(<TrialBanner trialEndsAt={inDays(1)} />);
    expect(screen.getByText('Your free trial ends in 1 day.')).toBeInTheDocument();
  });

  it('says the trial has ended', () => {
    render(<TrialBanner trialEndsAt={inDays(-1)} />);
    expect(screen.getByText('Your free trial has ended. Your data is safe — pay to keep adding and changing orders.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pay now' })).toHaveAttribute('href', '/billing');
  });

  it('uses "Your plan ends in 2 days." when paid', () => {
    render(<TrialBanner trialEndsAt={inDays(2)} paid />);
    expect(screen.getByText('Your plan ends in 2 days.')).toBeInTheDocument();
  });

  it('uses the singular for one day when paid', () => {
    render(<TrialBanner trialEndsAt={inDays(1)} paid />);
    expect(screen.getByText('Your plan ends in 1 day.')).toBeInTheDocument();
  });

  it('says the plan has ended when paid', () => {
    render(<TrialBanner trialEndsAt={inDays(-1)} paid />);
    expect(screen.getByText('Your plan has ended. Your data is safe — pay to keep adding and changing orders.')).toBeInTheDocument();
  });

  it('renders nothing for unlimited or more than 3 days left', () => {
    const { container, rerender } = render(<TrialBanner trialEndsAt={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TrialBanner trialEndsAt={inDays(10)} />);
    expect(container).toBeEmptyDOMElement();
  });
});

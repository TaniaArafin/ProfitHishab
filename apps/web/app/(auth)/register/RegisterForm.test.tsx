import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '@/lib/client-api';
import { RegisterForm } from './RegisterForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/client-api', () => ({
  api: vi.fn(),
  fieldError: (error: ApiError | null, field: string) => error?.fields?.[field]?.[0],
}));

describe('RegisterForm', () => {
  it('asks for the email as required, and the phone as optional, while there is no SMS gateway', () => {
    render(<RegisterForm otpRequired={false} emailRequired trialDays={7} />);
    const email = screen.getByLabelText(/^Email/);
    expect(email).toBeRequired();
    expect(screen.getByText('Email').closest('label')).not.toHaveTextContent(/optional|or phone/);
    expect(screen.getByLabelText(/^Mobile number/)).not.toBeRequired();
    expect(screen.getByText('Mobile number').closest('label')).toHaveTextContent('(optional)');
  });

  it('accepts an email or a phone once an SMS gateway exists', () => {
    render(<RegisterForm otpRequired={false} emailRequired={false} trialDays={7} />);
    expect(screen.getByLabelText(/^Email/)).not.toBeRequired();
    expect(screen.getByText('Email').closest('label')).toHaveTextContent('(email or phone is required)');
  });
});

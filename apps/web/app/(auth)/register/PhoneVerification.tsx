'use client';

import { useState } from 'react';
import type { OtpSentDto } from '@ph/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { useCountdown } from '@/lib/hooks';

/**
 * Registration step 1: the seller's mobile number and the SMS code sent to it.
 * Both inputs are named, so the surrounding form submits them with the rest of the account.
 */
export function PhoneVerification({ error }: { error: ApiError | null }) {
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resendIn, startResendTimer] = useCountdown();

  async function sendCode() {
    setSending(true);
    setSendError(null);
    const res = await api<OtpSentDto>('POST', '/auth/otp', { phone });
    setSending(false);
    if (!res.ok) {
      setSendError(fieldError(res.error, 'phone') ?? res.error.message);
      return;
    }
    setSentTo(phone);
    startResendTimer(res.data.resendIn);
  }

  const codeError = fieldError(error, 'code');
  // Submitted before asking for a code: the code field isn't shown yet, so say it here.
  const phoneError = sendError ?? fieldError(error, 'phone') ?? (!sentTo && codeError ? 'Send a code to this number first.' : undefined);
  const label = sentTo ? (resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code') : 'Send code';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label htmlFor="phone">Mobile number</Label>
        <div className="flex gap-2">
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="017XXXXXXXX"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? 'phone-error' : 'phone-hint'}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            disabled={sending || resendIn > 0 || !phone.trim()}
            onClick={sendCode}
          >
            {sending ? 'Sending…' : label}
          </Button>
        </div>
        {phoneError ? (
          <p className="mt-1 text-sm text-loss" id="phone-error">
            {phoneError}
          </p>
        ) : (
          <p className="mt-1 text-xs text-ink-faint" id="phone-hint">
            We text you a code to confirm the number. One free trial per number.
          </p>
        )}
      </div>
      {sentTo ? (
        <div>
          <Label htmlFor="code">SMS code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={12}
            required
            className="tabular tracking-[0.3em] placeholder:tracking-normal"
            aria-invalid={codeError ? true : undefined}
            aria-describedby={codeError ? 'code-error' : 'code-hint'}
          />
          {codeError ? (
            <p className="mt-1 text-sm text-loss" id="code-error">
              {codeError}
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-faint" id="code-hint" role="status">
              Code sent to {sentTo}. It works for 10 minutes.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

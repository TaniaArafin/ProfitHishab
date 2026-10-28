const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/**
 * Normalises a Bangladeshi mobile number to 11 digits (01XXXXXXXXX).
 * Accepts spaces, dashes, +88 / 88 prefixes and Bangla digits. Returns null when invalid.
 */
/** Turns Bangla digits (০-৯) into ASCII digits; everything else is kept. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[০-৯]/g, (ch) => String(BANGLA_DIGITS.indexOf(ch)));
}

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = toAsciiDigits(String(input)).replace(/[^\d]/g, '');

  if (digits.startsWith('880')) digits = digits.slice(2);
  else if (digits.startsWith('88') && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;

  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

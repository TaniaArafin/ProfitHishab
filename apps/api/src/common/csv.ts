const NEEDS_QUOTES = /[",\r\n]/;
/**
 * A cell Excel or Sheets would run as a formula: =, @, tab or CR first, or + / - unless the whole cell is
 * a plain number or phone (digits, spaces, dots, commas, dashes), so `-2+3+cmd|…` is still escaped.
 */
const FORMULA_START = /^(?:[=@\t\r]|[+-](?![0-9০-৯][0-9০-৯\s.,-]*$))/;

function cell(raw: string): string {
  // A leading ' makes the spreadsheet show the text instead of evaluating it (CSV injection).
  const value = FORMULA_START.test(raw) ? `'${raw}` : raw;
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * RFC 4180 CSV for download: a UTF-8 BOM first (so Excel reads Bangla text), CRLF line ends, and
 * quotes only around cells containing a quote, comma, CR or LF. Cells that would start a formula get a
 * leading ', but phone numbers (+880…) and negative amounts (-50) stay as they are.
 */
export function toCsv(header: string[], rows: string[][]): string {
  return `\uFEFF${[header, ...rows].map((r) => `${r.map(cell).join(',')}\r\n`).join('')}`;
}

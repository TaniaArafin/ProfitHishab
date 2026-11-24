import { Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

const withFormat = (href: string, format: 'csv' | 'xlsx') => `${href}${href.includes('?') ? '&' : '?'}format=${format}`;

/**
 * FR-REP-04: downloads a report as CSV or as an Excel workbook (.xlsx) through the `/api` proxy (the
 * session cookie goes along). `href` is the report's API path with its query, without `format`.
 */
export function ExportButtons({ href }: { href: string }) {
  return (
    <>
      <Button asChild variant="secondary">
        <a href={withFormat(href, 'xlsx')} download>
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          Export Excel
        </a>
      </Button>
      <Button asChild variant="secondary">
        <a href={withFormat(href, 'csv')} download>
          <Download className="h-4 w-4" aria-hidden />
          Export CSV
        </a>
      </Button>
    </>
  );
}

import type { ImportDto } from '@ph/shared';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** The file's first rows as they are. Wide files scroll sideways inside the card, never the page. */
export function SampleRows({ imp }: { imp: ImportDto }) {
  if (imp.sampleRows.length === 0) return null;
  return (
    <Card className="min-w-0 overflow-hidden">
      <h2 className="px-4 pt-4 font-semibold sm:px-5">First rows of your file</h2>
      <Table aria-label="First rows of your file" className="mt-3">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {imp.headers.map((h, i) => (
              <TableHead key={`${i}-${h}`} className="whitespace-nowrap">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* A fixed sample that never reorders, so the index is a stable key. */}
          {imp.sampleRows.map((row, r) => (
            <TableRow key={r}>
              {imp.headers.map((h, i) => (
                <TableCell key={`${i}-${h}`} className="max-w-[14rem] truncate whitespace-nowrap text-ink-muted">
                  {row[h] ?? ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

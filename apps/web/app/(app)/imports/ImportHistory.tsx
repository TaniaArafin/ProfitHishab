import Link from 'next/link';
import type { ImportListItemDto } from '@ph/shared';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatImportTime, IMPORT_STATUS_BADGES } from './status';
import { UndoImportButton } from './UndoImportButton';

function StatusBadge({ item }: { item: ImportListItemDto }) {
  const b = IMPORT_STATUS_BADGES[item.status];
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

/** Imports, newest first: a table from md, stacked cards below. Only the Undo button is a client component. */
export function ImportHistory({ imports }: { imports: ImportListItemDto[] }) {
  return (
    <>
      <Card className="hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>File</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="max-w-[20rem] truncate font-medium">
                  <Link href={`/imports/${item.id}`} className="hover:underline">
                    {item.fileName}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-ink-muted">{formatImportTime(item.createdAt)}</TableCell>
                <TableCell>
                  <StatusBadge item={item} />
                </TableCell>
                <TableCell className="text-right tabular">{item.importedOrders}</TableCell>
                <TableCell className="text-right">
                  {item.canUndo ? <UndoImportButton id={item.id} fileName={item.fileName} orders={item.importedOrders} /> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ul className="flex flex-col gap-2 md:hidden">
        {imports.map((item) => (
          <li key={item.id}>
            <Card className="flex items-center gap-3 p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/imports/${item.id}`} className="truncate font-semibold hover:underline">
                  {item.fileName}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  <StatusBadge item={item} />
                  <span>{formatImportTime(item.createdAt)}</span>
                  <span className="tabular">· {item.importedOrders} orders</span>
                </div>
              </div>
              {item.canUndo ? <UndoImportButton id={item.id} fileName={item.fileName} orders={item.importedOrders} /> : null}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

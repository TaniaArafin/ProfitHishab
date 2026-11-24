import type { ExpenseReportDto, MonthlyProfitReportDto, ProductProfitReportDto } from '@ph/shared';
import * as XLSX from 'xlsx';
import { expenseReportTable, monthlyProfitTable, productProfitTable, type ReportCell, type ReportTable } from './reports.table';

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Taka with thousands separators and 2 decimals; the value stays a number Excel can add up. */
const MONEY_FORMAT = '#,##0.00';

/** Every cell is written as a value, never a formula: text such as `=SUM(A1)` stays text. */
function toCell(cell: ReportCell): XLSX.CellObject {
  if (typeof cell === 'object') return { t: 'n', v: cell.money / 100, z: MONEY_FORMAT };
  return typeof cell === 'number' ? { t: 'n', v: cell } : { t: 's', v: cell };
}

/** Roughly how many characters Excel shows for a cell (money with grouping and decimals). */
function shownLength(cell: ReportCell | undefined): number {
  if (cell === undefined) return 0;
  if (typeof cell === 'object') return (cell.money / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }).length;
  return String(cell).length;
}

/** FR-REP-04 (Excel): one sheet with the table, columns sized to their longest heading or value. */
function xlsx(table: ReportTable): Buffer {
  const sheet: XLSX.WorkSheet = {};
  const all: ReportCell[][] = [table.header, ...table.rows];
  all.forEach((row, r) =>
    row.forEach((cell, c) => {
      sheet[XLSX.utils.encode_cell({ r, c })] = toCell(cell);
    }),
  );
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: all.length - 1, c: table.header.length - 1 } });
  sheet['!cols'] = table.header.map((_, c) => ({ wch: Math.max(8, ...all.map((row) => shownLength(row[c]) + 2)) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, table.sheet);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

export const monthlyProfitXlsx = (report: MonthlyProfitReportDto): Buffer => xlsx(monthlyProfitTable(report));
export const expenseReportXlsx = (report: ExpenseReportDto): Buffer => xlsx(expenseReportTable(report));
export const productProfitXlsx = (report: ProductProfitReportDto): Buffer => xlsx(productProfitTable(report));

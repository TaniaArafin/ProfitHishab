import type { ExpenseReportDto, MonthlyProfitReportDto, ProductProfitReportDto } from '@ph/shared';
import { toCsv } from '../../common/csv';
import { expenseReportTable, monthlyProfitTable, productProfitTable, type ReportCell, type ReportTable } from './reports.table';

/** Poisha as plain taka with 2 decimals, so Excel reads a number (no ৳, no grouping). */
export const taka = (poisha: number): string => (poisha / 100).toFixed(2);

const text = (cell: ReportCell): string => (typeof cell === 'object' ? taka(cell.money) : String(cell));

/** FR-REP-04: UTF-8 with a BOM (see `toCsv`). */
const csv = (table: ReportTable): string =>
  toCsv(
    table.header,
    table.rows.map((row) => row.map(text)),
  );

export const monthlyProfitCsv = (report: MonthlyProfitReportDto): string => csv(monthlyProfitTable(report));
export const expenseReportCsv = (report: ExpenseReportDto): string => csv(expenseReportTable(report));
export const productProfitCsv = (report: ProductProfitReportDto): string => csv(productProfitTable(report));

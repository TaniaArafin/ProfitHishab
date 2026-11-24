import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import {
  currentMonthIn,
  productReportQuerySchema,
  reportMonthsQuerySchema,
  resolvePeriod,
  type ProductReportQuery,
  type ReportMonthsQuery,
} from '@ph/shared';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { ProfitService } from './profit.service';
import { expenseReportCsv, monthlyProfitCsv, productProfitCsv } from './reports.csv';
import { expenseReportXlsx, monthlyProfitXlsx, productProfitXlsx, XLSX_TYPE } from './reports.xlsx';

type Format = 'json' | 'csv' | 'xlsx';

/** The same report as each export writes it. */
interface Exports<T> {
  csv: (report: T) => string;
  xlsx: (report: T) => Buffer;
}

/**
 * JSON as `{ data }`, or a download named `<name>.csv` / `<name>.xlsx`. Headers go on the file, not
 * @Header(), so errors stay JSON.
 */
function respond<T>(report: T, format: Format, name: string, exports: Exports<T>) {
  if (format === 'csv') {
    return new StreamableFile(Buffer.from(exports.csv(report), 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${name}.csv"`,
    });
  }
  if (format === 'xlsx') {
    return new StreamableFile(exports.xlsx(report), { type: XLSX_TYPE, disposition: `attachment; filename="${name}.xlsx"` });
  }
  return { data: report };
}

/** FR-REP-01–04: each report as JSON, or downloaded with `?format=csv` or `?format=xlsx`. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly profit: ProfitService) {}

  @Get('monthly-profit')
  async monthlyProfit(@Auth() auth: AuthContext, @Query(zod(reportMonthsQuerySchema)) query: ReportMonthsQuery) {
    const to = query.to ?? currentMonthIn(auth.timezone);
    const report = await this.profit.monthly(auth.businessId, to);
    return respond(report, query.format, `monthly-profit-${to}`, { csv: monthlyProfitCsv, xlsx: monthlyProfitXlsx });
  }

  @Get('expenses')
  async expenses(@Auth() auth: AuthContext, @Query(zod(reportMonthsQuerySchema)) query: ReportMonthsQuery) {
    const to = query.to ?? currentMonthIn(auth.timezone);
    const report = await this.profit.expenseReport(auth.businessId, to);
    return respond(report, query.format, `expenses-${to}`, { csv: expenseReportCsv, xlsx: expenseReportXlsx });
  }

  @Get('product-profit')
  async productProfit(@Auth() auth: AuthContext, @Query(zod(productReportQuerySchema)) query: ProductReportQuery) {
    const { from, to } = resolvePeriod(query, auth.timezone);
    const report = await this.profit.products(auth.businessId, { from, to }, {});
    return respond(report, query.format, `product-profit-${from}-to-${to}`, { csv: productProfitCsv, xlsx: productProfitXlsx });
  }
}

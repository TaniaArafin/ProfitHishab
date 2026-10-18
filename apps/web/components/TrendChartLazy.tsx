'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from './ui';

/** Recharts is ~110 kB; load it after first paint so the dashboard stays under the SRS JS budget. */
export const TrendChartLazy = dynamic(() => import('./TrendChart').then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton className="h-64" />,
});

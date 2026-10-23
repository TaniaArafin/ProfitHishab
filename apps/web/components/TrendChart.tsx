'use client';

import { formatTaka, formatTakaCompact, type TrendPointDto } from '@ph/shared';
import { colors } from '@/lib/theme-colors';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const label = (bucket: string, interval: 'day' | 'month') => {
  const d = new Date(`${bucket}T00:00:00Z`);
  return interval === 'day'
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    : d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export function TrendChart({ points, interval }: { points: TrendPointDto[]; interval: 'day' | 'month' }) {
  const data = points.map((p) => ({ ...p, label: label(p.bucket, interval) }));
  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.brand.DEFAULT} stopOpacity={0.18} />
              <stop offset="100%" stopColor={colors.brand.DEFAULT} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="profit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.gain.DEFAULT} stopOpacity={0.22} />
              <stop offset="100%" stopColor={colors.gain.DEFAULT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.ink.faint }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis
            tickFormatter={(v: number) => formatTakaCompact(v)}
            tick={{ fontSize: 11, fill: colors.ink.faint }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            formatter={(v) => formatTaka(Number(v))}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ borderRadius: 8, borderColor: colors.line, fontSize: 13 }}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke={colors.brand.DEFAULT} strokeWidth={2} fill="url(#rev)" />
          <Area type="monotone" dataKey="netProfit" name="Net profit" stroke={colors.gain.DEFAULT} strokeWidth={2} fill="url(#profit)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

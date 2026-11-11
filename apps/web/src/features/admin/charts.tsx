import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PRIORITY_LABELS, type TicketPriority, type TicketStatus } from '@campus-resolve/shared';
import { Card, CardBody, CardHeader, EmptyState, Button, Input, Select, cn } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useReportTrend } from '../tickets/api';
import type { AcademicPeriod, RoleDashboard, SystemDashboard } from '../../types';

/* -------------------------------------------------------------------------- */
/* Palette and theme                                                          */
/* -------------------------------------------------------------------------- */

const STATUS_COLORS: Record<TicketStatus, string> = {
  SUBMITTED: '#94a3b8',
  AWAITING_ASSIGNMENT: '#f59e0b',
  ASSIGNED: '#0ea5e9',
  ACKNOWLEDGED: '#6366f1',
  IN_PROGRESS: '#3b82f6',
  AWAITING_STUDENT: '#8b5cf6',
  AWAITING_EXTERNAL: '#06b6d4',
  ESCALATED: '#f97316',
  RESOLVED: '#10b981',
  CLOSED: '#64748b',
  REOPENED: '#f43f5e',
  WITHDRAWN: '#cbd5e1',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: '#94a3b8',
  NORMAL: '#0ea5e9',
  HIGH: '#f59e0b',
  URGENT: '#f43f5e',
};

/** Chart chrome (axes, grid, tooltip) follows the light/dark theme. */
function useChartTheme() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const grid = dark ? '#1e293b' : '#e2e8f0';
  const axis = dark ? '#94a3b8' : '#64748b';
  const tooltip: CSSProperties = {
    backgroundColor: dark ? '#0f172a' : '#ffffff',
    border: `1px solid ${grid}`,
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
    color: dark ? '#e2e8f0' : '#0f172a',
    fontSize: 12,
  };
  return { dark, grid, axis, tooltip, label: dark ? '#e2e8f0' : '#0f172a' };
}

function ChartShell({
  title,
  description,
  children,
  className,
  height,
  toolbar,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  height: number;
  toolbar?: ReactNode;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} description={description} />
      <CardBody className="flex-1">
        {toolbar}
        <div style={{ height }} aria-hidden={false}>
          {children}
        </div>
      </CardBody>
    </Card>
  );
}

function EmptyChart({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <EmptyState title="Nothing to show yet" description="Data appears here once reports exist." />
    </Card>
  );
}

type TrendGranularity = 'hour' | 'day';

const formatBucket = (value: string, granularity: TrendGranularity): string => {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return granularity === 'hour'
    ? date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

const compactNumber = (value: number): string => value.toLocaleString();

/** Formats a Date for a native datetime-local input, in the user's time zone. */
const toDateTimeInput = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const TREND_PRESETS = [
  { value: '24h', label: '24 hours', hours: 24 },
  { value: '7d', label: '7 days', hours: 24 * 7 },
  { value: '14d', label: '14 days', hours: 24 * 14 },
  { value: '30d', label: '30 days', hours: 24 * 30 },
] as const;

/* -------------------------------------------------------------------------- */
/* Report volume over time                                                    */
/* -------------------------------------------------------------------------- */

export function ReportTrendChart({
  trend: fallback,
  academicPeriodId,
  period,
}: {
  trend: SystemDashboard['trend'];
  academicPeriodId?: string | undefined;
  period?: AcademicPeriod | null | undefined;
}) {
  const chart = useChartTheme();
  const [preset, setPreset] = useState<string>('14d');
  const [from, setFrom] = useState(() => toDateTimeInput(new Date(Date.now() - 13 * 86_400_000)));
  const [to, setTo] = useState(() => toDateTimeInput(new Date()));
  const [granularity, setGranularity] = useState<TrendGranularity>('day');

  // A chosen period drives the range; the dates stay editable.
  useEffect(() => {
    if (!period) return;
    setFrom(toDateTimeInput(new Date(period.startsAt)));
    setTo(toDateTimeInput(new Date(period.endsAt)));
    const days = (new Date(period.endsAt).getTime() - new Date(period.startsAt).getTime()) / 86_400_000;
    setGranularity(days <= 2 ? 'hour' : 'day');
    setPreset('period');
  }, [period]);

  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  const rangeValid = Number.isFinite(fromTime) && Number.isFinite(toTime) && fromTime <= toTime;

  const trendQuery = useReportTrend({
    from: rangeValid ? new Date(fromTime).toISOString() : '',
    to: rangeValid ? new Date(toTime).toISOString() : '',
    granularity,
    academicPeriodId,
  });

  const trend = rangeValid ? (trendQuery.data?.trend ?? fallback) : fallback;
  const hasActivity = trend.some((point) => point.created > 0 || point.resolved > 0);

  const applyPreset = (value: string, hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 3_600_000);
    setFrom(toDateTimeInput(start));
    setTo(toDateTimeInput(end));
    setGranularity(hours <= 48 ? 'hour' : 'day');
    setPreset(value);
  };

  const toolbar = (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick ranges">
        {TREND_PRESETS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={preset === option.value ? 'subtle' : 'secondary'}
            onClick={() => applyPreset(option.value, option.hours)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          From
          <Input
            type="datetime-local"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              setPreset('custom');
            }}
            className="h-9 w-[13.5rem] text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          To
          <Input
            type="datetime-local"
            value={to}
            min={from || undefined}
            max={toDateTimeInput(new Date())}
            onChange={(event) => {
              setTo(event.target.value);
              setPreset('custom');
            }}
            className="h-9 w-[13.5rem] text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Group by
          <Select
            value={granularity}
            onChange={(event) => {
              setGranularity(event.target.value as TrendGranularity);
              setPreset('custom');
            }}
            className="h-9 w-24 text-sm"
          >
            <option value="day">Day</option>
            <option value="hour">Hour</option>
          </Select>
        </label>
      </div>
    </div>
  );

  return (
    <ChartShell
      title="Report volume"
      description={
        period
          ? `Reports created and resolved in ${period.label}.`
          : 'Reports created and resolved for the selected range.'
      }
      height={260}
      toolbar={toolbar}
    >
      {!rangeValid ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Choose a start time before the end time.
        </div>
      ) : !hasActivity ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          No reports were created or resolved in this range.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="createdGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="resolvedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatBucket(String(value), granularity)}
              tick={{ fill: chart.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={18}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: chart.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={chart.tooltip}
              labelStyle={{ color: chart.label, fontWeight: 600 }}
              labelFormatter={(value) => formatBucket(String(value), granularity)}
              formatter={(value, name) => [compactNumber(Number(value)), String(name)]}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: chart.axis, paddingTop: 8 }}
            />
            <Area
              type="monotone"
              dataKey="created"
              name="Created"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#createdGradient)"
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="resolved"
              name="Resolved"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#resolvedGradient)"
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Status mix                                                                 */
/* -------------------------------------------------------------------------- */

export function StatusMixChart({
  data,
  total,
}: {
  data: SystemDashboard['statusBreakdown'];
  total: number;
}) {
  const chart = useChartTheme();

  if (data.length === 0) {
    return (
      <EmptyChart title="Status mix" description="Every report by its current status." />
    );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader title="Status mix" description="Every report by its current status." />
      <CardBody className="flex flex-1 flex-col">
        <div className="relative h-[170px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="label"
                innerRadius="58%"
                outerRadius="86%"
                paddingAngle={2}
                stroke="none"
              >
                {data.map((slice) => (
                  <Cell key={slice.status} fill={STATUS_COLORS[slice.status] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={chart.tooltip}
                labelStyle={{ color: chart.label, fontWeight: 600 }}
                formatter={(value, name) => [compactNumber(Number(value)), String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-slate-900">{total}</span>
            <span className="text-xs text-slate-500">reports</span>
          </div>
        </div>
        <ul className="mt-3 grid gap-1.5">
          {data.slice(0, 6).map((slice) => (
            <li key={slice.status} className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[slice.status] ?? '#94a3b8' }}
              />
              <span className="flex-1 truncate text-slate-600">{slice.label}</span>
              <span className="font-medium tabular-nums text-slate-900">{slice.count}</span>
              <span className="w-10 text-right tabular-nums text-slate-400">
                {total === 0 ? '0%' : `${Math.round((slice.count / total) * 100)}%`}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Priority mix                                                               */
/* -------------------------------------------------------------------------- */

const PRIORITY_ORDER: TicketPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

export function PriorityMixChart({
  data,
}: {
  data: SystemDashboard['priorityBreakdown'];
}) {
  const chart = useChartTheme();
  const rows = PRIORITY_ORDER.map((priority) => {
    const found = data.find((slice) => slice.priority === priority);
    return { priority, label: PRIORITY_LABELS[priority], count: found?.count ?? 0 };
  });

  if (rows.every((row) => row.count === 0)) {
    return <EmptyChart title="Priority mix" description="Reports by declared priority." />;
  }

  return (
    <ChartShell title="Priority mix" description="Reports by declared priority." height={180}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: chart.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={56}
            tick={{ fill: chart.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: chart.grid, opacity: 0.4 }}
            contentStyle={chart.tooltip}
            labelStyle={{ color: chart.label, fontWeight: 600 }}
            formatter={(value) => [compactNumber(Number(value)), 'Reports']}
          />
          <Bar dataKey="count" name="Reports" radius={[0, 4, 4, 0]} barSize={16}>
            {rows.map((row) => (
              <Cell key={row.priority} fill={PRIORITY_COLORS[row.priority]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Department workload                                                        */
/* -------------------------------------------------------------------------- */

export function DepartmentWorkloadChart({
  departments,
}: {
  departments: SystemDashboard['departments'];
}) {
  const chart = useChartTheme();
  const rows = departments
    .filter((department) => department.total > 0 || department.open > 0)
    .sort((left, right) => right.open - left.open);
  const height = Math.max(220, rows.length * 44);

  if (rows.length === 0) {
    return (
      <EmptyChart
        title="Department workload"
        description="Open, unassigned and overdue reports by department."
      />
    );
  }

  return (
    <ChartShell
      title="Department workload"
      description="Open, unassigned and overdue reports by department."
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          barCategoryGap={10}
        >
          <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: chart.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={132}
            tick={{ fill: chart.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: chart.grid, opacity: 0.4 }}
            contentStyle={chart.tooltip}
            labelStyle={{ color: chart.label, fontWeight: 600 }}
            formatter={(value, name) => [compactNumber(Number(value)), String(name)]}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, color: chart.axis, paddingTop: 8 }}
          />
          <Bar dataKey="open" name="Open" fill="#6366f1" radius={[0, 3, 3, 0]} barSize={7} />
          <Bar
            dataKey="unassigned"
            name="Unassigned"
            fill="#f59e0b"
            radius={[0, 3, 3, 0]}
            barSize={7}
          />
          <Bar dataKey="overdue" name="Overdue" fill="#f43f5e" radius={[0, 3, 3, 0]} barSize={7} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard composition                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The chart cards live in their own module so the charting library is only
 * downloaded when an administrator opens the operations dashboard.
 */
export function DashboardCharts({
  dashboard,
  academicPeriodId,
  period,
}: {
  dashboard: SystemDashboard;
  academicPeriodId?: string | undefined;
  period?: AcademicPeriod | null | undefined;
}) {
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ReportTrendChart
            trend={dashboard.trend}
            academicPeriodId={academicPeriodId}
            period={period}
          />
        </div>
        <StatusMixChart data={dashboard.statusBreakdown} total={dashboard.totals.total} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DepartmentWorkloadChart departments={dashboard.departments} />
        </div>
        <PriorityMixChart data={dashboard.priorityBreakdown} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Role-scoped dashboards                                                     */
/* -------------------------------------------------------------------------- */

/** A fixed two-week activity chart for the signed-in person's own scope. */
export function RoleTrendChart({
  trend,
  title,
  description,
}: {
  trend: RoleDashboard['trend'];
  title: string;
  description: string;
}) {
  const chart = useChartTheme();
  const hasActivity = trend.some((point) => point.created > 0 || point.resolved > 0);

  return (
    <ChartShell title={title} description={description} height={240}>
      {!hasActivity ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            No activity in the last two weeks
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Activity appears here as reports are created and resolved.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="roleCreatedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#407bd9" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#407bd9" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="roleResolvedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatBucket(String(value), 'day')}
              tick={{ fill: chart.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={18}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: chart.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={chart.tooltip}
              labelStyle={{ color: chart.label, fontWeight: 600 }}
              labelFormatter={(value) => formatBucket(String(value), 'day')}
              formatter={(value, name) => [compactNumber(Number(value)), String(name)]}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: chart.axis, paddingTop: 8 }}
            />
            <Area
              type="monotone"
              dataKey="created"
              name="Created"
              stroke="#407bd9"
              strokeWidth={2}
              fill="url(#roleCreatedGradient)"
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="resolved"
              name="Resolved"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#roleResolvedGradient)"
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

/**
 * Chart composition shared by the student and staff dashboards. Both receive
 * only the data the API already scoped to the signed-in person.
 */
export function RoleDashboardCharts({
  dashboard,
  audience,
}: {
  dashboard: RoleDashboard;
  audience: 'student' | 'staff';
}) {
  const activityTitle = audience === 'student' ? 'Your report activity' : 'Your office activity';
  const activityDescription =
    audience === 'student'
      ? 'Reports you created and saw resolved over the last two weeks.'
      : 'Reports created and resolved across the departments you can access.';

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RoleTrendChart
            trend={dashboard.trend}
            title={activityTitle}
            description={activityDescription}
          />
        </div>
        <StatusMixChart data={dashboard.statusBreakdown} total={dashboard.totals.total} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DepartmentWorkloadChart departments={dashboard.departments} />
        </div>
        <PriorityMixChart data={dashboard.priorityBreakdown} />
      </div>
    </>
  );
}

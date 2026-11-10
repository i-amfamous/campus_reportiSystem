import type { CSSProperties, ReactNode } from 'react';
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
import { Card, CardBody, CardHeader, EmptyState, cn } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import type { SystemDashboard } from '../../types';

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
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  height: number;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} description={description} />
      <CardBody className="flex-1">
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

const formatDay = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

const compactNumber = (value: number): string => value.toLocaleString();

/* -------------------------------------------------------------------------- */
/* Report volume over time                                                    */
/* -------------------------------------------------------------------------- */

export function ReportTrendChart({ trend }: { trend: SystemDashboard['trend'] }) {
  const chart = useChartTheme();
  const hasActivity = trend.some((point) => point.created > 0 || point.resolved > 0);

  if (!hasActivity) {
    return (
      <EmptyChart
        title="Report volume"
        description="Reports created and resolved over the last 14 days."
      />
    );
  }

  return (
    <ChartShell
      title="Report volume"
      description="Reports created and resolved over the last 14 days."
      height={260}
    >
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
            tickFormatter={formatDay}
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
            labelFormatter={(value) => formatDay(String(value))}
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
export function DashboardCharts({ dashboard }: { dashboard: SystemDashboard }) {
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ReportTrendChart trend={dashboard.trend} />
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

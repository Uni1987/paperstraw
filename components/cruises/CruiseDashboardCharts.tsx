"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Car, House, TreePine } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type { ComparisonCardData } from "@/lib/comparisons";
import { formatCompactNumber } from "@/lib/format";
import type { CruiseBreakdownPoint, CruiseDailyEmissionPoint, CruiseRankRow } from "@/lib/cruises/queries";

const operatorColors = ["#D9A441", "#EC4899", "#8B5CF6", "#38BDF8", "#22C55E", "#64748B"];
const segmentColors = ["#D9A441", "#8B5CF6", "#38BDF8"];

export function CruiseDashboardCharts({
  dailyEmissions,
  topShips,
  operatorBreakdown,
  segmentBreakdown,
  comparisons,
  totalCo2Tonnes
}: {
  dailyEmissions: CruiseDailyEmissionPoint[];
  topShips: CruiseRankRow[];
  operatorBreakdown: CruiseBreakdownPoint[];
  segmentBreakdown: CruiseBreakdownPoint[];
  comparisons: ComparisonCardData[];
  totalCo2Tonnes: number;
}) {
  return (
    <>
      <section className="mt-5 grid items-stretch gap-4 md:mt-4 xl:grid-cols-2">
        <CruiseEmissionsTimeline data={dailyEmissions} />
        <TopCruiseShipsChart data={topShips} />
      </section>

      <section className="mt-4">
        <CruiseEmissionsBreakdown operatorBreakdown={operatorBreakdown} segmentBreakdown={segmentBreakdown} totalCo2Tonnes={totalCo2Tonnes} />
      </section>

      <section className="mt-4">
        <CruiseComparisonCards comparisons={comparisons} />
      </section>
    </>
  );
}

function CruiseEmissionsTimeline({ data }: { data: CruiseDailyEmissionPoint[] }) {
  const hasData = data.some((point) => point.estimatedCo2Tonnes > 0);
  const isSparse = data.length > 0 && data.length <= 2;

  return (
    <DashboardCard title="Estimated CO₂ emissions over time">
      <div className="border-b border-white/10 px-5 py-3">
        <p className="text-xs leading-5 text-white/42">Estimated emissions from verified observed cruise activity.</p>
      </div>
      <div className="flex min-h-80 flex-1 flex-col p-4">
        {hasData ? (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 18, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="cruise-emissions-over-time" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#D9A441" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#D9A441" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                    tickFormatter={(value: unknown) => `${Math.round(Number(value)).toLocaleString()}t`}
                    width={58}
                  />
                  <Tooltip content={<CruiseChartTooltip />} cursor={{ stroke: "rgba(217,164,65,0.45)" }} />
                  <Area type={data.length > 1 ? "monotone" : "linear"} dataKey="estimatedCo2Tonnes" stroke="#D9A441" strokeWidth={3} fill="url(#cruise-emissions-over-time)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/38">
              Observed activity only.{isSparse ? " More observed data will improve this view." : ""}
            </p>
          </>
        ) : (
          <CruiseChartEmptyState title="Building observed emissions history." detail="Verified daily estimates will appear here once enough observed activity is stored." />
        )}
      </div>
    </DashboardCard>
  );
}

function TopCruiseShipsChart({ data }: { data: CruiseRankRow[] }) {
  return (
    <DashboardCard title="Top cruise ships by estimated CO₂">
      <div className="border-b border-white/10 px-5 py-3">
        <p className="text-xs leading-5 text-white/42">Since monitoring began.</p>
      </div>
      <div className="flex min-h-80 flex-1 flex-col p-4">
        {data.length ? (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.slice(0, 6)} layout="vertical" margin={{ top: 8, right: 22, bottom: 4, left: 10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="shipName"
                    width={142}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "rgba(255,255,255,0.72)", fontSize: 12 }}
                    tickFormatter={(value: unknown) => truncateLabel(String(value))}
                  />
                  <Tooltip content={<CruiseChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="co2Tonnes" fill="#EC4899" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/38">Verified ships only.</p>
          </>
        ) : (
          <CruiseChartEmptyState title="No verified cruise emissions available yet." detail="This chart appears once verified ships have stored daily estimates." />
        )}
      </div>
    </DashboardCard>
  );
}

function CruiseEmissionsBreakdown({
  operatorBreakdown,
  segmentBreakdown,
  totalCo2Tonnes
}: {
  operatorBreakdown: CruiseBreakdownPoint[];
  segmentBreakdown: CruiseBreakdownPoint[];
  totalCo2Tonnes: number;
}) {
  return (
    <DashboardCard title="CO₂ emissions breakdown">
      <div className="grid min-h-80 gap-8 p-5 lg:grid-cols-2">
        <CruiseDonutPanel
          title="CO₂ by operator"
          subtitle="Observed activity since monitoring began."
          data={operatorBreakdown}
          colors={operatorColors}
          totalCo2Tonnes={totalCo2Tonnes}
        />
        <CruiseDonutPanel
          title="CO₂ by cruise segment"
          subtitle="Verified ships only."
          data={segmentBreakdown}
          colors={segmentColors}
          totalCo2Tonnes={totalCo2Tonnes}
        />
      </div>
    </DashboardCard>
  );
}

function CruiseDonutPanel({
  title,
  subtitle,
  data,
  colors,
  totalCo2Tonnes
}: {
  title: string;
  subtitle: string;
  data: CruiseBreakdownPoint[];
  colors: string[];
  totalCo2Tonnes: number;
}) {
  if (!data.length) {
    return (
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-white/42">{subtitle}</p>
        <CruiseChartEmptyState title="Building observed emissions breakdown." detail="Verified estimate data will populate this view as observations accumulate." />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-white/42">{subtitle}</p>
      <div className="mt-6 flex justify-center">
        <div className="grid w-full max-w-[25rem] gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
          <div className="relative mx-auto h-40 w-40 sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="estimatedCo2Tonnes" innerRadius={42} outerRadius={70} paddingAngle={2}>
                  {data.map((point, index) => (
                    <Cell key={point.label} fill={getColor(colors, point, index)} />
                  ))}
                </Pie>
                <Tooltip content={<CruiseChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold leading-none text-white">{formatCompactNumber(totalCo2Tonnes)}</p>
              <p className="mt-1 text-[0.52rem] uppercase leading-none tracking-[0.1em] text-white/48">TOTAL T</p>
            </div>
          </div>
          <div className="space-y-2">
            {data.map((point, index) => (
              <div key={point.label} className="flex items-center justify-between gap-3 text-[0.82rem]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getColor(colors, point, index) }} />
                  <span className="truncate text-white/76">{point.label}</span>
                </div>
                <span className="font-semibold tabular-nums text-white">{point.percent.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CruiseComparisonCards({ comparisons }: { comparisons: ComparisonCardData[] }) {
  return (
    <DashboardCard title="CO₂ comparisons">
      <div className="grid gap-4 p-5 md:grid-cols-3">
        {comparisons.map((comparison) => (
          <article
            key={comparison.id}
            className="min-h-56 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-black/20 p-6 shadow-xl shadow-black/20"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-paper">
              {comparisonIcon(comparison.id)}
            </div>
            <p className="mt-8 text-4xl font-semibold tracking-normal text-white">{comparison.value}</p>
            <p className="mt-1 text-base font-semibold text-paper">{comparison.unit}</p>
            <h3 className="mt-5 text-xl font-semibold text-white">{comparisonTitle(comparison.id, comparison.title)}</h3>
            <p className="mt-3 text-sm leading-6 text-white/52">{comparisonSubtitle(comparison.id)}</p>
            <p className="mt-5 text-xs leading-5 text-white/34">Based on estimated verified cruise CO₂ observed since monitoring began.</p>
          </article>
        ))}
      </div>
    </DashboardCard>
  );
}

function CruiseChartEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-72 flex-1 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] px-6 py-10 text-center">
      <div className="max-w-sm">
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-2 text-sm leading-6 text-white/44">{detail}</p>
      </div>
    </div>
  );
}

function getColor(colors: string[], point: CruiseBreakdownPoint, index: number) {
  if (point.label === "Operator not published" || point.label === "Other") return "#64748B";
  return colors[index % colors.length];
}

function comparisonIcon(id: string) {
  const className = "h-8 w-8";
  if (id === "household-electricity") return <House className={className} strokeWidth={1.8} />;
  if (id === "lifetime-trees") return <TreePine className={className} strokeWidth={1.8} />;
  return <Car className={className} strokeWidth={1.8} />;
}

function comparisonTitle(id: string, fallback: string) {
  if (id === "driving-distance") return "Driving distance";
  if (id === "household-electricity") return "Annual electricity use";
  if (id === "lifetime-trees") return "Trees required";
  return fallback;
}

function comparisonSubtitle(id: string) {
  if (id === "driving-distance") return "Equivalent to driving an average gasoline car.";
  if (id === "household-electricity") return "Equivalent household electricity consumption.";
  if (id === "lifetime-trees") return "Estimated trees needed to offset these emissions.";
  return "A simplified emissions comparison for public understanding.";
}

function CruiseChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);

  return (
    <div className="rounded-xl border border-white/10 bg-[#0B1110] px-3 py-2 text-sm shadow-2xl">
      <p className="font-semibold text-white">{label ?? payload[0]?.name}</p>
      <p className="mt-1 text-paper">{Math.round(value).toLocaleString("en-US")} t CO₂ est.</p>
    </div>
  );
}

function truncateLabel(value: string) {
  return value.length > 21 ? `${value.slice(0, 20)}…` : value;
}

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
import type { ReactNode } from "react";
import { AirportEmissionsMap } from "@/components/dashboard/AirportEmissionsMap";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { dashboardGridRowClass } from "@/components/dashboard/dashboardGrid";
import type { AwarenessRankPoint, AwarenessSeriesPoint } from "@/lib/awareness/types";
import type { ComparisonCardData } from "@/lib/comparisons";
import { buildAircraftCategoryBreakdown, buildCountryBreakdown, type DonutBreakdownPoint } from "@/lib/dashboard/breakdowns";
import type { AirportEmissionPoint } from "@/lib/dashboard/report";
import { formatCompactNumber } from "@/lib/format";

const countryColors = ["#8B5CF6", "#3B82F6", "#22C55E", "#D9A441", "#F97316", "#EC4899"];
const countryOtherColor = "#64748B";
const aircraftCategoryColors = ["#22C55E", "#14B8A6", "#38BDF8", "#6366F1", "#A78BFA", "#F59E0B", "#94A3B8"];

type VisualsProps = {
  monthlySeries: AwarenessSeriesPoint[];
  topAirports: AwarenessRankPoint[];
  topCountries: AwarenessRankPoint[];
  aircraftTypes: AwarenessRankPoint[];
  comparisons: ComparisonCardData[];
  totalCo2Kg: number;
  airportEmissionPoints: AirportEmissionPoint[];
  showMap?: boolean;
};

export function DashboardVisuals({
  monthlySeries,
  topAirports,
  topCountries,
  aircraftTypes,
  comparisons,
  totalCo2Kg,
  airportEmissionPoints,
  showMap = true
}: VisualsProps) {
  return (
    <>
      {showMap ? <AirportEmissionsMap airports={airportEmissionPoints} /> : null}

      <DashboardGridRow>
        <EmissionsTimelineChart data={monthlySeries} />
        <TopAirportsChart data={topAirports} />
      </DashboardGridRow>

      <DashboardGridRow>
        <EmissionsBreakdownCard countries={topCountries} aircraftTypes={aircraftTypes} totalCo2Kg={totalCo2Kg} />
        <ComparisonCards comparisons={comparisons} />
      </DashboardGridRow>
    </>
  );
}

function DashboardGridRow({ children }: { children: ReactNode }) {
  return <div className={dashboardGridRowClass}>{children}</div>;
}

function EmissionsTimelineChart({ data }: { data: AwarenessSeriesPoint[] }) {
  return (
    <DashboardCard title="CO2 emissions over time">
      <div className="h-80 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 18, right: 16, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="dashboard-emissions" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
              tickFormatter={(value: unknown) => `${Math.round(Number(value) / 1000).toLocaleString()}t`}
              width={58}
            />
            <Tooltip content={<DashboardTooltip />} cursor={{ stroke: "rgba(139,92,246,0.45)" }} />
            <Area type="monotone" dataKey="estimatedCo2Kg" stroke="#A78BFA" strokeWidth={3} fill="url(#dashboard-emissions)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}

function TopAirportsChart({ data }: { data: AwarenessRankPoint[] }) {
  return (
    <DashboardCard title="Top airports by CO2 emissions">
      <div className="h-80 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 18, bottom: 4, left: 14 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
            <XAxis
              type="number"
              hide
            />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(255,255,255,0.72)", fontSize: 12 }}
            />
            <Tooltip content={<DashboardTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="estimatedCo2Kg" fill="#EC4899" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  );
}

function EmissionsBreakdownCard({
  countries,
  aircraftTypes,
  totalCo2Kg
}: {
  countries: AwarenessRankPoint[];
  aircraftTypes: AwarenessRankPoint[];
  totalCo2Kg: number;
}) {
  const countryData = buildCountryBreakdown(countries, totalCo2Kg);
  const aircraftCategoryData = buildAircraftCategoryBreakdown(aircraftTypes, totalCo2Kg);

  return (
    <DashboardCard title="CO2 emissions breakdown">
      <div className="grid min-h-80 gap-10 p-5 md:grid-cols-2 xl:gap-12">
        <DonutBreakdown title="CO2 by Country" data={countryData} colors={countryColors} totalCo2Kg={totalCo2Kg} otherColor={countryOtherColor} />
        <DonutBreakdown title="CO2 by Aircraft Type" data={aircraftCategoryData} colors={aircraftCategoryColors} totalCo2Kg={totalCo2Kg} />
      </div>
    </DashboardCard>
  );
}

function DonutBreakdown({
  title,
  data,
  colors,
  totalCo2Kg,
  otherColor
}: {
  title: string;
  data: DonutBreakdownPoint[];
  colors: string[];
  totalCo2Kg: number;
  otherColor?: string;
}) {
  const getPointColor = (point: DonutBreakdownPoint, index: number) => (point.label === "Other" && otherColor ? otherColor : colors[index % colors.length]);

  return (
    <section className="flex h-full flex-col">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-6 flex justify-center">
        <div className="grid w-full max-w-[18rem] grid-cols-[7rem_minmax(0,1fr)] items-start gap-5 xl:max-w-[19rem] xl:gap-7">
          <div className="relative h-36 w-28 self-start">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="estimatedCo2Kg" innerRadius={28} outerRadius={56} paddingAngle={2}>
                  {data.map((entry, index) => (
                    <Cell key={entry.label} fill={getPointColor(entry, index)} />
                  ))}
                </Pie>
                <Tooltip content={<DashboardTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-[0.82rem] font-semibold leading-none text-white">{formatCompactNumber(totalCo2Kg / 1000)}</p>
              <p className="mt-1 text-[0.5rem] uppercase leading-none tracking-[0.1em] text-white/48">TOTAL</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {data.map((point, index) => (
              <div key={point.label} className="flex items-center justify-between gap-3 text-[0.82rem]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getPointColor(point, index) }} />
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

function ComparisonCards({ comparisons }: { comparisons: ComparisonCardData[] }) {
  return (
    <DashboardCard title="CO2 comparisons">
      <div className="grid min-h-80 gap-4 p-5 md:grid-cols-3">
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
          </article>
        ))}
      </div>
    </DashboardCard>
  );
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

function DashboardTooltip({
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
      <p className="mt-1 text-paper">{formatTonnes(value)} CO2 est.</p>
    </div>
  );
}

function formatTonnes(valueKg: number) {
  return Math.round(valueKg / 1000).toLocaleString();
}

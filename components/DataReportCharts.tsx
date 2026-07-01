"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DataSeriesPoint } from "@/lib/data/report";

export type DataReportChartsProps = {
  flightsPerDay: DataSeriesPoint[];
  importsPerDay: DataSeriesPoint[];
};

export function DataReportCharts({
  flightsPerDay,
  importsPerDay
}: DataReportChartsProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ReportChart title="Flights per day" description="Imported aggregate flight records by departure date.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={flightsPerDay} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} width={44} />
            <Tooltip content={<ReportTooltip />} cursor={{ fill: "rgba(217,164,65,0.08)" }} />
            <Bar dataKey="flights" name="Flights" fill="#D9A441" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ReportChart>

      <ReportChart title="Imports per day" description="Ingestion records and daily job outcomes from import logs.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={importsPerDay} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.58)", fontSize: 12 }} width={44} />
            <Tooltip content={<ReportTooltip />} cursor={{ fill: "rgba(217,164,65,0.08)" }} />
            <Legend iconType="circle" wrapperStyle={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }} />
            <Bar dataKey="recordsImported" name="Records" fill="#D9A441" radius={[6, 6, 0, 0]} />
            <Bar dataKey="successfulImports" name="Successful imports" fill="#F3E7C9" radius={[6, 6, 0, 0]} />
            <Bar dataKey="failedImports" name="Failed imports" fill="#CF5C5C" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ReportChart>
    </div>
  );
}

function ReportChart({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-white/60">{description}</p>
      </div>
      <div className="h-72">{children}</div>
    </section>
  );
}

function ReportTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-white/10 bg-[#111412] px-3 py-2 text-sm shadow-2xl">
      <div className="font-semibold text-white">{label}</div>
      <div className="mt-2 space-y-1">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-5 text-white/70">
            <span>{item.name}</span>
            <span className="font-semibold tabular-nums text-white">{Number(item.value ?? 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

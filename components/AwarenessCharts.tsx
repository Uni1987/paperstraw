"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { AwarenessRankPoint, AwarenessSeriesPoint } from "@/lib/awareness/types";
import { formatCo2 } from "@/lib/format";

export function AwarenessCharts({
  dailySeries,
  monthlySeries,
  topCountries,
  topAirports
}: {
  dailySeries: AwarenessSeriesPoint[];
  monthlySeries: AwarenessSeriesPoint[];
  topCountries: AwarenessRankPoint[];
  topAirports: AwarenessRankPoint[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard title="Estimated CO₂ emissions per day" data={dailySeries} layout="time" />
      <ChartCard title="Estimated CO₂ emissions per month" data={monthlySeries} layout="time" />
      <ChartCard title="Top countries by estimated private jet CO₂" data={topCountries} layout="rank" />
      <ChartCard title="Top airports by estimated private jet CO₂" data={topAirports} layout="rank" />
    </div>
  );
}

function ChartCard({
  title,
  data,
  layout
}: {
  title: string;
  data: Array<AwarenessSeriesPoint | AwarenessRankPoint>;
  layout: "time" | "rank";
}) {
  const dataKey = layout === "time" ? "period" : "label";

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 10, left: 4, bottom: layout === "rank" ? 58 : 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d8e2dd" />
            <XAxis
              dataKey={dataKey}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={layout === "rank" ? -35 : 0}
              textAnchor={layout === "rank" ? "end" : "middle"}
              height={layout === "rank" ? 68 : 28}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: unknown) => `${Math.round(Number(value) / 1000).toLocaleString()}t`}
              width={58}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) =>
                name === "estimatedCo2Kg" ? [formatCo2(Number(value)), "Estimated CO₂"] : [String(value), "Flights"]
              }
              contentStyle={{ borderRadius: 8, borderColor: "#d8e2dd" }}
            />
            <Bar dataKey="estimatedCo2Kg" radius={[6, 6, 0, 0]} fill={layout === "rank" ? "#b16f54" : "#50695f"} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

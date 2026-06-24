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
import type { TimeSeriesPoint } from "@/lib/leaderboard/types";
import { formatCo2 } from "@/lib/format";

export function EmissionsChart({ data }: { data: TimeSeriesPoint[] }) {
  return (
    <div className="h-80 rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 6, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d8e2dd" />
          <XAxis dataKey="period" tickLine={false} axisLine={false} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: unknown) => `${Math.round(Number(value) / 1000)}t`}
            width={48}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) =>
              name === "estimatedCo2Kg" ? [formatCo2(Number(value)), "Estimated CO₂"] : [String(value), "Flights"]
            }
            contentStyle={{ borderRadius: 8, borderColor: "#d8e2dd" }}
          />
          <Bar dataKey="estimatedCo2Kg" radius={[6, 6, 0, 0]} fill="#50695f" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

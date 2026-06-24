"use client";

import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { AwarenessRankPoint, AwarenessSeriesPoint } from "@/lib/awareness/types";

type EditorialChartProps =
  | {
      kind: "time";
      data: AwarenessSeriesPoint[];
    }
  | {
      kind: "rank";
      data: AwarenessRankPoint[];
    };

export function EditorialChart(props: EditorialChartProps) {
  if (props.kind === "time") {
    return (
      <motion.div
        className="h-[22rem] w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-4 sm:h-[28rem] sm:p-6"
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={props.data} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="paperstraw-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#D9A441" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#D9A441" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "rgba(255,255,255,0.56)", fontSize: 12 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(255,255,255,0.56)", fontSize: 12 }}
              tickFormatter={(value: unknown) => `${Math.round(Number(value) / 1000).toLocaleString()}t`}
              width={56}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(217,164,65,0.35)", strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="estimatedCo2Kg"
              stroke="#D9A441"
              strokeWidth={3}
              fill="url(#paperstraw-area)"
              activeDot={{ r: 5, fill: "#D9A441", stroke: "#0B0D0C" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="h-[24rem] w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-4 sm:h-[28rem] sm:p-6"
      initial={{ opacity: 0, scale: 0.98 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={props.data} layout="vertical" margin={{ top: 8, right: 16, left: 12, bottom: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(255,255,255,0.56)", fontSize: 12 }}
            tickFormatter={(value: unknown) => `${Math.round(Number(value) / 1000).toLocaleString()}t`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(255,255,255,0.72)", fontSize: 12 }}
            width={96}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="estimatedCo2Kg" radius={[0, 8, 8, 0]} fill="#D9A441" />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);

  return (
    <div className="rounded-md border border-white/10 bg-[#111412] px-3 py-2 text-sm shadow-2xl">
      <div className="font-semibold text-white">{label}</div>
      <div className="mt-1 text-paper">{Math.round(value / 1000).toLocaleString()} tonnes CO2 est.</div>
    </div>
  );
}

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import type { TrafficStats } from "@/lib/types";

interface TrafficFlowChartProps {
  data: TrafficStats[];
  height?: number;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="glass-deep rounded-sm border border-[#00f0ff]/15 px-3 py-2 shadow-[0_0_20px_#00f0ff10]">
      <p className="mb-1 font-data text-[10px] text-[#4a6a8a]">{label}</p>
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex items-center gap-2 font-data text-xs text-slate-200"
        >
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="uppercase tracking-wider">{entry.name}</span>
          <span className="ml-auto tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function CustomLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>;
}) {
  if (!payload) return null;

  return (
    <div className="mt-2 flex items-center justify-center gap-4">
      {payload.map((entry) => (
        <div
          key={entry.value}
          className="flex items-center gap-1.5 font-data text-[10px] uppercase tracking-wider text-[#4a6a8a]"
        >
          <span
            className="inline-block size-2 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function TrafficFlowChart({
  data,
  height = 300,
}: TrafficFlowChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(0, 240, 255, 0.06)"
          vertical={false}
        />

        <XAxis
          dataKey="camera_name"
          tick={{
            fill: "#4a6a8a",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}
          axisLine={{ stroke: "rgba(0, 240, 255, 0.08)" }}
          tickLine={false}
        />

        <YAxis
          tick={{
            fill: "#4a6a8a",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}
          axisLine={false}
          tickLine={false}
        />

        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />

        <Bar
          dataKey="vehicle_count"
          name="vehicles"
          fill="#00ff88"
          radius={[2, 2, 0, 0]}
          barSize={18}
        />
        <Bar
          dataKey="person_count"
          name="persons"
          fill="#00f0ff"
          radius={[2, 2, 0, 0]}
          barSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { AlertTrendDataPoint } from "@/lib/types";

interface AlertTrendChartProps {
  data: AlertTrendDataPoint[];
  height?: number;
}

const ALERT_COLORS: Record<string, string> = {
  intrusion: "#ff2d78",
  loitering: "#ffaa00",
  crowd: "#00f0ff",
  fight: "#8b5cf6",
  fire: "#ff6b35",
  other: "#4a6a8a",
};

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

export function AlertTrendChart({ data, height = 300 }: AlertTrendChartProps) {
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
          dataKey="time"
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

        <Bar
          dataKey="intrusion"
          stackId="alerts"
          fill={ALERT_COLORS.intrusion}
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="loitering"
          stackId="alerts"
          fill={ALERT_COLORS.loitering}
        />
        <Bar
          dataKey="crowd"
          stackId="alerts"
          fill={ALERT_COLORS.crowd}
        />
        <Bar
          dataKey="fight"
          stackId="alerts"
          fill={ALERT_COLORS.fight}
        />
        <Bar
          dataKey="fire"
          stackId="alerts"
          fill={ALERT_COLORS.fire}
        />
        <Bar
          dataKey="other"
          stackId="alerts"
          fill={ALERT_COLORS.other}
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

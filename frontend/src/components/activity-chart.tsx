"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { ActivityDataPoint } from "@/lib/types";

interface ActivityChartProps {
  data: ActivityDataPoint[];
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

export function ActivityChart({ data, height = 300 }: ActivityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="actGradCyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="actGradGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00ff88" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#00ff88" stopOpacity={0.01} />
          </linearGradient>
        </defs>

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

        <Area
          type="monotone"
          dataKey="people"
          stroke="#00f0ff"
          strokeWidth={1.5}
          fill="url(#actGradCyan)"
          dot={false}
          activeDot={{
            r: 3,
            strokeWidth: 0,
            fill: "#00f0ff",
            style: { filter: "drop-shadow(0 0 4px #00f0ff)" },
          }}
        />

        <Area
          type="monotone"
          dataKey="vehicles"
          stroke="#00ff88"
          strokeWidth={1.5}
          fill="url(#actGradGreen)"
          dot={false}
          activeDot={{
            r: 3,
            strokeWidth: 0,
            fill: "#00ff88",
            style: { filter: "drop-shadow(0 0 4px #00ff88)" },
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface CameraUptimeData {
  camera_name: string;
  uptime: number;
}

interface CameraUptimeChartProps {
  data: CameraUptimeData[];
  height?: number;
}

function uptimeColor(uptime: number): string {
  if (uptime >= 95) return "#00ff88";
  if (uptime >= 80) return "#ffaa00";
  return "#ff2d78";
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const value = payload[0].value;

  return (
    <div className="glass-deep rounded-sm border border-[#00f0ff]/15 px-3 py-2 shadow-[0_0_20px_#00f0ff10]">
      <p className="mb-1 font-data text-[10px] text-[#4a6a8a]">{label}</p>
      <p className="font-data text-sm" style={{ color: uptimeColor(value) }}>
        {value.toFixed(1)}% UPTIME
      </p>
    </div>
  );
}

export function CameraUptimeChart({
  data,
  height = 300,
}: CameraUptimeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(0, 240, 255, 0.06)"
          horizontal={false}
        />

        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{
            fill: "#4a6a8a",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}
          axisLine={{ stroke: "rgba(0, 240, 255, 0.08)" }}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />

        <YAxis
          type="category"
          dataKey="camera_name"
          tick={{
            fill: "#4a6a8a",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}
          axisLine={false}
          tickLine={false}
          width={120}
        />

        <Tooltip content={<CustomTooltip />} />

        <Bar dataKey="uptime" radius={[0, 2, 2, 0]} barSize={14}>
          {data.map((entry, index) => (
            <Cell key={index} fill={uptimeColor(entry.uptime)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

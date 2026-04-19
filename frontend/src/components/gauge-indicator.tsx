"use client";

import { cn } from "@/lib/utils";

type GaugeColor = "cyan" | "red" | "amber" | "green";

interface GaugeIndicatorProps {
  value: number;
  label: string;
  color?: GaugeColor;
}

const strokeColors: Record<GaugeColor, string> = {
  cyan: "#00f0ff",
  red: "#ff2d78",
  amber: "#ffaa00",
  green: "#00ff88",
};

const glowFilters: Record<GaugeColor, string> = {
  cyan: "drop-shadow(0 0 4px #00f0ff66)",
  red: "drop-shadow(0 0 4px #ff2d7866)",
  amber: "drop-shadow(0 0 4px #ffaa0066)",
  green: "drop-shadow(0 0 4px #00ff8866)",
};

const textGlowClasses: Record<GaugeColor, string> = {
  cyan: "text-[#00f0ff] text-glow",
  red: "text-[#ff2d78] text-glow-red",
  amber: "text-[#ffaa00]",
  green: "text-[#00ff88]",
};

export function GaugeIndicator({
  value,
  label,
  color = "cyan",
}: GaugeIndicatorProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  // SVG arc parameters for a semi-circle
  const cx = 60;
  const cy = 55;
  const r = 45;
  const startAngle = Math.PI;
  const totalArc = Math.PI;
  const filledArc = totalArc * (clampedValue / 100);

  // Background arc: full semi-circle from left to right
  const bgStartX = cx + r * Math.cos(startAngle);
  const bgStartY = cy - r * Math.sin(startAngle);
  const bgEndX = cx + r * Math.cos(0);
  const bgEndY = cy - r * Math.sin(0);

  const bgPath = `M ${bgStartX} ${bgStartY} A ${r} ${r} 0 0 1 ${bgEndX} ${bgEndY}`;

  // Filled arc
  const filledEndAngle = startAngle - filledArc;
  const filledEndX = cx + r * Math.cos(filledEndAngle);
  const filledEndY = cy - r * Math.sin(filledEndAngle);
  const largeArc = filledArc > Math.PI / 2 ? 1 : 0;

  const filledPath =
    clampedValue > 0
      ? `M ${bgStartX} ${bgStartY} A ${r} ${r} 0 ${largeArc} 1 ${filledEndX} ${filledEndY}`
      : "";

  // Tick marks every 10%
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const pct = i / 10;
    const angle = startAngle - totalArc * pct;
    const innerR = r - 4;
    const outerR = r + 4;
    return {
      x1: cx + innerR * Math.cos(angle),
      y1: cy - innerR * Math.sin(angle),
      x2: cx + outerR * Math.cos(angle),
      y2: cy - outerR * Math.sin(angle),
    };
  });

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="h-auto w-28">
        {/* Tick marks */}
        {ticks.map((tick, i) => (
          <line
            key={i}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="#4a6a8a"
            strokeWidth={0.5}
            opacity={0.4}
          />
        ))}
        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke="#1a2a3a"
          strokeWidth={7}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {filledPath && (
          <path
            d={filledPath}
            fill="none"
            stroke={strokeColors[color]}
            strokeWidth={7}
            strokeLinecap="round"
            style={{ filter: glowFilters[color] }}
          />
        )}
      </svg>
      <span
        className={cn(
          "font-data text-2xl font-semibold -mt-3",
          textGlowClasses[color]
        )}
      >
        {clampedValue}
      </span>
      <span className="mt-0.5 font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
        {label}
      </span>
    </div>
  );
}

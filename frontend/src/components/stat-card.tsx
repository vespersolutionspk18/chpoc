"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown } from "lucide-react";

type StatColor = "cyan" | "red" | "amber" | "green";
type Trend = "up" | "down" | "neutral";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  delta?: string;
  trend?: Trend;
  color?: StatColor;
  /** @deprecated Use `color` instead */
  glowColor?: StatColor;
}

const colorConfig: Record<
  StatColor,
  {
    icon: string;
    value: string;
    border: string;
    glow: string;
    textGlow: string;
  }
> = {
  cyan: {
    icon: "text-[#00f0ff]",
    value: "text-[#00f0ff]",
    border: "border-t-[#00f0ff]",
    glow: "hover:glow-cyan",
    textGlow:
      "text-shadow: 0 0 10px rgba(0, 240, 255, 0.5), 0 0 40px rgba(0, 240, 255, 0.2)",
  },
  red: {
    icon: "text-[#ff2d78]",
    value: "text-[#ff2d78]",
    border: "border-t-[#ff2d78]",
    glow: "hover:glow-red",
    textGlow:
      "text-shadow: 0 0 10px rgba(255, 45, 120, 0.5), 0 0 40px rgba(255, 45, 120, 0.2)",
  },
  amber: {
    icon: "text-[#ffaa00]",
    value: "text-[#ffaa00]",
    border: "border-t-[#ffaa00]",
    glow: "hover:glow-amber",
    textGlow:
      "text-shadow: 0 0 10px rgba(255, 170, 0, 0.5), 0 0 40px rgba(255, 170, 0, 0.2)",
  },
  green: {
    icon: "text-[#00ff88]",
    value: "text-[#00ff88]",
    border: "border-t-[#00ff88]",
    glow: "hover:glow-green",
    textGlow:
      "text-shadow: 0 0 10px rgba(0, 255, 136, 0.5), 0 0 40px rgba(0, 255, 136, 0.2)",
  },
};

const trendConfig: Record<
  "up" | "down",
  { icon: typeof ArrowUp; color: string }
> = {
  up: { icon: ArrowUp, color: "text-[#00ff88]" },
  down: { icon: ArrowDown, color: "text-[#ff2d78]" },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  trend,
  color,
  glowColor,
}: StatCardProps) {
  const resolvedColor = color ?? glowColor ?? "cyan";
  const config = colorConfig[resolvedColor];

  return (
    <div
      className={cn(
        "hud-card rounded-sm border-t-2 p-4 transition-all duration-300",
        config.border,
        config.glow
      )}
    >
      {/* Top row: icon + label */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("size-4 shrink-0", config.icon)} />
        <span className="font-heading text-[10px] uppercase tracking-widest text-[#4a6a8a]">
          {label}
        </span>
      </div>

      {/* Center: value */}
      <div className="mb-2">
        <span
          className={cn("font-data text-2xl font-bold", config.value)}
          style={{ textShadow: config.textGlow.replace("text-shadow: ", "") }}
        >
          {value}
        </span>
      </div>

      {/* Bottom: delta + trend */}
      {delta && (
        <div className="flex items-center gap-1">
          {trend && trend !== "neutral" && (
            (() => {
              const TrendIcon = trendConfig[trend].icon;
              return (
                <TrendIcon
                  className={cn("size-3", trendConfig[trend].color)}
                />
              );
            })()
          )}
          <span className="font-data text-xs text-[#4a6a8a]">{delta}</span>
        </div>
      )}
    </div>
  );
}

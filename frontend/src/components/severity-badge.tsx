"use client";

import { cn } from "@/lib/utils";
import type { AlertSeverity } from "@/lib/types";

interface SeverityBadgeProps {
  severity: AlertSeverity;
}

const severityConfig: Record<
  AlertSeverity,
  { label: string; className: string }
> = {
  critical: {
    label: "CRITICAL",
    className: cn(
      "bg-[#ff2d78]/20 text-[#ff2d78] border-[#ff2d78]/30",
      "shadow-[0_0_8px_#ff2d7840]",
      "animate-pulse"
    ),
  },
  high: {
    label: "HIGH",
    className: "bg-[#ff6b35]/15 text-[#ff6b35] border-[#ff6b35]/20",
  },
  medium: {
    label: "MEDIUM",
    className: "bg-[#ffaa00]/15 text-[#ffaa00] border-[#ffaa00]/20",
  },
  low: {
    label: "LOW",
    className: "bg-[#4a6a8a]/15 text-[#4a6a8a] border-[#4a6a8a]/20",
  },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const config = severityConfig[severity];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5",
        "font-data text-[10px] uppercase tracking-wider leading-none",
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

"use client";

import { motion } from "framer-motion";
import { Check, X, ArrowUp } from "lucide-react";

import type { Alert } from "@/lib/types";
import { SeverityBadge } from "@/components/severity-badge";
import { cn } from "@/lib/utils";

interface AlertRowProps {
  alert: Alert;
  onAcknowledge?: (alertId: string) => void;
  onDismiss?: (alertId: string) => void;
  onEscalate?: (alertId: string) => void;
}

function getRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const severityBarColors: Record<string, string> = {
  critical: "bg-[#ff2d78]",
  high: "bg-[#ff6b35]",
  medium: "bg-[#ffaa00]",
  low: "bg-[#4a6a8a]",
};

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return "text-[#ff2d78]";
  if (confidence >= 0.7) return "text-[#ffaa00]";
  return "text-[#00f0ff]";
}

export function AlertRow({
  alert,
  onAcknowledge,
  onDismiss,
  onEscalate,
}: AlertRowProps) {
  const isCritical = alert.severity === "critical";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "group relative flex h-10 items-center gap-2 overflow-hidden rounded-sm border border-white/5",
        "glass-deep transition-colors hover:border-[#00f0ff]/15",
        isCritical && "shadow-[0_0_12px_#ff2d7820]"
      )}
    >
      {/* Left severity color bar */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-[2px]",
          severityBarColors[alert.severity] ?? "bg-[#4a6a8a]"
        )}
      />

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-3 pr-2">
        <SeverityBadge severity={alert.severity} />

        <span className="shrink-0 font-heading text-xs uppercase tracking-wider text-slate-300">
          {alert.alert_type.replace(/_/g, " ")}
        </span>

        <span className="shrink-0 font-data text-xs text-[#00f0ff]/60">
          {alert.camera_id}
        </span>

        <span className="ml-auto shrink-0 font-data text-xs text-[#4a6a8a]">
          {getRelativeTime(alert.timestamp)}
        </span>

        <span
          className={cn(
            "shrink-0 font-data text-xs",
            confidenceColor(alert.confidence)
          )}
        >
          {(alert.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Action buttons -- visible on hover */}
      <div className="flex items-center gap-0.5 overflow-hidden pr-2 opacity-0 transition-opacity group-hover:opacity-100">
        {onAcknowledge && (
          <button
            onClick={() => onAcknowledge(alert.id)}
            className="rounded-sm p-1 text-[#00ff88] transition-colors hover:bg-[#00ff88]/10"
          >
            <Check className="size-3.5" />
          </button>
        )}
        {onDismiss && (
          <button
            onClick={() => onDismiss(alert.id)}
            className="rounded-sm p-1 text-[#4a6a8a] transition-colors hover:bg-white/5"
          >
            <X className="size-3.5" />
          </button>
        )}
        {onEscalate && (
          <button
            onClick={() => onEscalate(alert.id)}
            className="rounded-sm p-1 text-[#ffaa00] transition-colors hover:bg-[#ffaa00]/10"
          >
            <ArrowUp className="size-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

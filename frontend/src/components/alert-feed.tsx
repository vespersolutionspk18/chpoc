"use client";

import { AnimatePresence } from "framer-motion";

import type { Alert } from "@/lib/types";
import { AlertRow } from "@/components/alert-row";
import { cn } from "@/lib/utils";

interface AlertFeedProps {
  alerts: Alert[];
  maxItems?: number;
  onAlertClick?: (alert: Alert) => void;
  onAcknowledge?: (alertId: string) => void;
  onDismiss?: (alertId: string) => void;
  onEscalate?: (alertId: string) => void;
}

export function AlertFeed({
  alerts,
  maxItems = 10,
  onAlertClick,
  onAcknowledge,
  onDismiss,
  onEscalate,
}: AlertFeedProps) {
  const displayed = alerts.slice(0, maxItems);
  const unreadCount = alerts.filter((a) => a.status === "new").length;

  return (
    <div className={cn("hud-card glass-deep flex flex-col rounded-sm")}>
      {/* Header with scan-line */}
      <div className="relative flex items-center justify-between border-b border-[#00f0ff]/10 px-4 py-2.5">
        <div className="scan-line pointer-events-none absolute inset-0" />
        <h3 className="font-heading text-xs uppercase tracking-widest text-[#00f0ff]">
          LIVE ALERTS
        </h3>
        {unreadCount > 0 && (
          <span className="inline-flex items-center rounded-sm bg-[#ff2d78]/20 px-1.5 py-0.5 font-data text-[10px] text-[#ff2d78] shadow-[0_0_8px_#ff2d7840]">
            {unreadCount}
          </span>
        )}
      </div>

      {/* Scrollable alert list */}
      <div className="max-h-[480px] space-y-1 overflow-y-auto p-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#00f0ff]/10">
        <AnimatePresence initial={false}>
          {displayed.map((alert) => (
            <div
              key={alert.id}
              onClick={() => onAlertClick?.(alert)}
              className={onAlertClick ? "cursor-pointer" : undefined}
            >
              <AlertRow
                alert={alert}
                onAcknowledge={onAcknowledge}
                onDismiss={onDismiss}
                onEscalate={onEscalate}
              />
            </div>
          ))}
        </AnimatePresence>

        {displayed.length === 0 && (
          <p className="py-8 text-center font-data text-xs text-[#4a6a8a]">
            NO ACTIVE ALERTS
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import type { CameraStatus } from "@/lib/types";
import { StatusDot } from "@/components/status-dot";
import { cn } from "@/lib/utils";

interface CameraStatusBadgeProps {
  status: CameraStatus;
}

const statusConfig: Record<CameraStatus, { label: string; color: string }> = {
  online: { label: "ONLINE", color: "text-[#00ff88]" },
  offline: { label: "OFFLINE", color: "text-[#ff2d78]" },
  degraded: { label: "DEGRADED", color: "text-[#ffaa00]" },
};

export function CameraStatusBadge({ status }: CameraStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot status={status} size="sm" />
      <span
        className={cn(
          "font-data text-[10px] uppercase tracking-wider",
          config.color
        )}
      >
        {config.label}
      </span>
    </span>
  );
}

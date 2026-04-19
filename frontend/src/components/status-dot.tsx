"use client";

import { cn } from "@/lib/utils";

type StatusDotStatus =
  | "online"
  | "offline"
  | "degraded"
  | "connected"
  | "disconnected";

type StatusDotSize = "sm" | "md" | "lg";

interface StatusDotProps {
  status: StatusDotStatus;
  size?: StatusDotSize;
}

const sizePx: Record<StatusDotSize, number> = {
  sm: 6,
  md: 8,
  lg: 10,
};

const statusConfig: Record<
  StatusDotStatus,
  { color: string; glow: string; animate: string }
> = {
  online: {
    color: "#00ff88",
    glow: "shadow-[0_0_6px_#00ff88,0_0_12px_#00ff8866]",
    animate: "animate-ping",
  },
  connected: {
    color: "#00ff88",
    glow: "shadow-[0_0_6px_#00ff88,0_0_12px_#00ff8866]",
    animate: "animate-ping",
  },
  offline: {
    color: "#ff2d78",
    glow: "shadow-[0_0_6px_#ff2d78,0_0_12px_#ff2d7866]",
    animate: "",
  },
  disconnected: {
    color: "#ff2d78",
    glow: "shadow-[0_0_6px_#ff2d78,0_0_12px_#ff2d7866]",
    animate: "",
  },
  degraded: {
    color: "#ffaa00",
    glow: "shadow-[0_0_6px_#ffaa00,0_0_12px_#ffaa0066]",
    animate: "animate-pulse",
  },
};

export function StatusDot({ status, size = "md" }: StatusDotProps) {
  const px = sizePx[size];
  const config = statusConfig[status];
  const hasRing = status === "online" || status === "connected";

  return (
    <span className="relative inline-flex items-center justify-center">
      {/* Pulsing ring for online/connected */}
      {hasRing && (
        <span
          className={cn("absolute rounded-full opacity-60", config.animate)}
          style={{
            width: px,
            height: px,
            backgroundColor: config.color,
          }}
        />
      )}
      {/* Core dot */}
      <span
        className={cn(
          "relative inline-block rounded-full",
          config.glow,
          status === "degraded" && "animate-pulse"
        )}
        style={{
          width: px,
          height: px,
          backgroundColor: config.color,
        }}
      />
    </span>
  );
}

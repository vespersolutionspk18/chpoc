"use client";

import { useAppStore } from "@/lib/stores/use-app-store";
import { StatusDot } from "@/components/status-dot";

export function ConnectionStatus() {
  const wsConnected = useAppStore((s) => s.wsConnected);

  return (
    <div className="inline-flex items-center gap-2">
      <StatusDot
        status={wsConnected ? "connected" : "disconnected"}
        size="sm"
      />
      <span className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
        LINK
      </span>
      <span
        className={
          wsConnected
            ? "font-data text-[10px] text-[#00ff88]"
            : "font-data text-[10px] text-[#ff2d78]"
        }
      >
        {wsConnected ? "ACTIVE" : "LOST"}
      </span>
    </div>
  );
}

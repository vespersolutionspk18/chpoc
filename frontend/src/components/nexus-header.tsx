"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useAlertStore } from "@/lib/stores/use-alert-store";

export function CommandHeader() {
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const [clock, setClock] = useState("");

  useEffect(() => {
    function tick() {
      const now = new Date();
      setClock(
        now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="glass-deep flex h-14 shrink-0 items-center gap-3 px-4"
      style={{
        borderBottom: "1px solid rgba(0, 240, 255, 0.3)",
        boxShadow: "0 1px 12px rgba(0, 240, 255, 0.08)",
      }}
    >
      {/* Sidebar trigger */}
      <SidebarTrigger className="-ml-1 text-[#4a6a8a] hover:text-[#00f0ff] transition-colors" />

      <Separator
        orientation="vertical"
        className="!h-5"
        style={{ backgroundColor: "rgba(0, 240, 255, 0.12)" }}
      />

      {/* Branding */}
      <div className="flex flex-col justify-center">
        <span
          className="font-heading text-sm tracking-[0.2em] text-[#00f0ff] text-glow leading-tight"
        >
          SAFE CITY
        </span>
        <span className="font-data text-[9px] text-[#4a6a8a] tracking-wider leading-tight">
          COMMAND CENTER
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* System status indicators */}
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-heading text-[9px] tracking-wider text-[#4a6a8a]">SYS</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff88] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00ff88]" />
          </span>
          <span className="font-data text-[10px] text-[#00ff88]">NOMINAL</span>
        </div>

        <Separator
          orientation="vertical"
          className="!h-4"
          style={{ backgroundColor: "rgba(0, 240, 255, 0.12)" }}
        />

        <div className="flex items-center gap-1.5">
          <span className="font-heading text-[9px] tracking-wider text-[#4a6a8a]">AI</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff88] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00ff88]" />
          </span>
          <span className="font-data text-[10px] text-[#00ff88]">ONLINE</span>
        </div>

        <Separator
          orientation="vertical"
          className="!h-4"
          style={{ backgroundColor: "rgba(0, 240, 255, 0.12)" }}
        />
      </div>

      {/* Alert bell */}
      <button
        type="button"
        className="relative inline-flex items-center justify-center rounded-md p-1.5 text-[#4a6a8a] hover:text-[#00f0ff] transition-colors"
        aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <>
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff2d78] px-1 text-[9px] font-bold text-white leading-none font-data">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[#ff2d78] animate-ping opacity-40" />
          </>
        )}
      </button>

      <Separator
        orientation="vertical"
        className="!h-4"
        style={{ backgroundColor: "rgba(0, 240, 255, 0.12)" }}
      />

      {/* Live clock */}
      <span className="font-data text-xs text-[#00f0ff] text-glow min-w-[68px] text-right tracking-wider">
        {clock}
      </span>

      <Separator
        orientation="vertical"
        className="!h-4"
        style={{ backgroundColor: "rgba(0, 240, 255, 0.12)" }}
      />

      {/* Operator badge */}
      <div className="flex items-center gap-2">
        <span className="font-heading text-[9px] tracking-wider text-[#4a6a8a] hidden sm:inline">
          OPERATOR
        </span>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full border font-data text-[10px] font-bold text-[#00f0ff]"
          style={{
            borderColor: "rgba(0, 240, 255, 0.3)",
            background: "rgba(0, 240, 255, 0.05)",
          }}
        >
          OP
        </div>
      </div>
    </header>
  );
}

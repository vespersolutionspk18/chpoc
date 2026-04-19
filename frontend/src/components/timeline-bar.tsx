"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

interface TimelineEvent {
  id: string;
  label: string;
  start: string;
  end: string;
  type: string;
  active: boolean;
}

interface TimelineBarProps {
  events: TimelineEvent[];
}

const typeColors: Record<string, string> = {
  intrusion: "#ff2d78",
  loitering: "#ffaa00",
  crowd: "#00f0ff",
  fight: "#8b5cf6",
  fire: "#ff6b35",
  maintenance: "#4a6a8a",
  default: "#4a6a8a",
};

function getTypeColor(type: string): string {
  return typeColors[type.toLowerCase()] ?? typeColors.default;
}

function getTypeGlow(type: string): string {
  const color = getTypeColor(type);
  return `drop-shadow(0 0 6px ${color}80)`;
}

function formatTimeLabel(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TimelineBar({ events }: TimelineBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (events.length === 0) return null;

  // Compute the full time range from all events
  const allStarts = events.map((e) => new Date(e.start).getTime());
  const allEnds = events.map((e) => new Date(e.end).getTime());
  const minTime = Math.min(...allStarts);
  const maxTime = Math.max(...allEnds);
  const totalSpan = maxTime - minTime || 1;

  // Generate time markers
  const markerCount = 6;
  const markers = Array.from({ length: markerCount }, (_, i) => {
    const t = minTime + (totalSpan * i) / (markerCount - 1);
    return {
      pct: (i / (markerCount - 1)) * 100,
      label: formatTimeLabel(new Date(t).toISOString()),
    };
  });

  return (
    <div className="relative w-full rounded-sm border border-[#00f0ff]/10 bg-[#030712]/60 p-3">
      {/* Time markers */}
      <div className="relative mb-1 flex h-4 w-full items-end">
        {markers.map((m, i) => (
          <span
            key={i}
            className="absolute font-data text-[9px] text-[#4a6a8a]"
            style={{
              left: `${m.pct}%`,
              transform: i === markers.length - 1 ? "translateX(-100%)" : i === 0 ? "none" : "translateX(-50%)",
            }}
          >
            {m.label}
          </span>
        ))}
      </div>

      {/* Track */}
      <div className="relative h-7 w-full rounded-sm bg-[#0a1525]">
        {/* Tick lines */}
        {markers.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-px bg-[#00f0ff]/8"
            style={{ left: `${m.pct}%` }}
          />
        ))}

        {events.map((evt) => {
          const startMs = new Date(evt.start).getTime();
          const endMs = new Date(evt.end).getTime();
          const leftPct = ((startMs - minTime) / totalSpan) * 100;
          const widthPct = ((endMs - startMs) / totalSpan) * 100;
          const color = getTypeColor(evt.type);

          return (
            <div
              key={evt.id}
              className={cn(
                "absolute top-1 bottom-1 rounded-sm transition-all",
                evt.active && "z-10"
              )}
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(widthPct, 0.5)}%`,
                backgroundColor: color,
                opacity: evt.active ? 0.9 : 0.5,
                filter: evt.active ? getTypeGlow(evt.type) : "none",
              }}
              onMouseEnter={() => setHoveredId(evt.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Tooltip */}
              {hoveredId === evt.id && (
                <div className="glass-deep absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-[#00f0ff]/15 px-2.5 py-1.5 font-data text-[10px] text-slate-200 shadow-lg">
                  <span className="uppercase tracking-wider">{evt.label}</span>
                  <br />
                  <span className="text-[#4a6a8a]">
                    {formatTimeLabel(evt.start)} - {formatTimeLabel(evt.end)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

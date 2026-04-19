"use client";

import type { Detection } from "@/lib/types";

interface DetectionOverlayProps {
  detections: Detection[];
  width: number;
  height: number;
}

const typeColors: Record<string, string> = {
  person: "#00f0ff",
  vehicle: "#00ff88",
};

function colorForType(objectType: string): string {
  return typeColors[objectType.toLowerCase()] ?? "#ffaa00";
}

export function DetectionOverlay({
  detections,
  width,
  height,
}: DetectionOverlayProps) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {detections.map((det, idx) => {
        const { x, y: y1, width: boxW, height: boxH } = det.bbox;
        const color = colorForType(det.object_type);

        return (
          <rect
            key={det.track_id ?? idx}
            x={x}
            y={y1}
            width={boxW}
            height={boxH}
            stroke={color}
            strokeWidth={1.5}
            fill="none"
            rx={1}
          />
        );
      })}
    </svg>
  );
}

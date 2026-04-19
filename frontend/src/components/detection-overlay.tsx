"use client";

interface DetectionOverlayProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detections: any[];
  width: number;
  height: number;
}

const typeColors: Record<string, string> = {
  person: "#00f0ff",
  vehicle: "#00ff88",
  bike: "#ffaa00",
  bag: "#ff2d78",
};

function colorForType(objectType: unknown): string {
  if (!objectType || typeof objectType !== "string") return "#ffaa00";
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
        const bbox = det?.bbox;
        if (!bbox) return null;

        const x = Number(bbox.x ?? 0);
        const y1 = Number(bbox.y ?? 0);
        const boxW = Number(bbox.width ?? bbox.w ?? 50);
        const boxH = Number(bbox.height ?? bbox.h ?? 50);
        const objType = det.object_class ?? det.object_type ?? "other";
        const color = colorForType(objType);

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

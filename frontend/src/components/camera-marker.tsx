"use client";

import L from "leaflet";
import type { CameraStatus } from "@/lib/types";

const STATUS_COLORS: Record<CameraStatus, string> = {
  online: "#22c55e",
  offline: "#ef4444",
  degraded: "#f59e0b",
};

export function createCameraIcon(status: CameraStatus): L.DivIcon {
  const color = STATUS_COLORS[status];

  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      ">
        <div style="
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: ${color};
          box-shadow: 0 0 8px ${color}, 0 0 16px ${color}80;
          border: 1.5px solid rgba(255,255,255,0.3);
        "></div>
        <span style="
          font-size: 7px;
          font-weight: 700;
          color: ${color};
          font-family: monospace;
          letter-spacing: 0.5px;
          text-shadow: 0 0 4px ${color}80;
        ">CAM</span>
      </div>
    `,
  });
}

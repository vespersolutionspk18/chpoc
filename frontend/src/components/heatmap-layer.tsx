"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

import type { HeatmapPoint } from "@/lib/types";

interface HeatmapLayerProps {
  points: HeatmapPoint[];
}

function intensityToColor(intensity: number): string {
  // Clamp intensity to 0-1
  const t = Math.max(0, Math.min(1, intensity));

  if (t < 0.5) {
    // Cyan to yellow transition (low to medium)
    const f = t * 2;
    const r = Math.round(0 + f * 255);
    const g = Math.round(230 - f * 30);
    const b = Math.round(230 - f * 230);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Yellow to red transition (medium to high)
  const f = (t - 0.5) * 2;
  const r = 255;
  const g = Math.round(200 - f * 200);
  const b = 0;
  return `rgb(${r}, ${g}, ${b})`;
}

export function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    // Clean up previous layer group
    if (layerGroupRef.current) {
      layerGroupRef.current.remove();
    }

    const layerGroup = L.layerGroup();
    layerGroupRef.current = layerGroup;

    for (const point of points) {
      const color = intensityToColor(point.intensity);
      const radius = 20 + point.intensity * 80;
      const opacity = 0.15 + point.intensity * 0.35;

      L.circle([point.lat, point.lng], {
        radius,
        color: "transparent",
        fillColor: color,
        fillOpacity: opacity,
        interactive: false,
      }).addTo(layerGroup);

      // Add a smaller, brighter core circle
      L.circle([point.lat, point.lng], {
        radius: radius * 0.4,
        color: "transparent",
        fillColor: color,
        fillOpacity: opacity * 1.5,
        interactive: false,
      }).addTo(layerGroup);
    }

    layerGroup.addTo(map);

    return () => {
      layerGroup.remove();
    };
  }, [map, points]);

  return null;
}

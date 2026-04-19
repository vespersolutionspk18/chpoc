"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { TrackPathPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TrackPathMapProps {
  points: TrackPathPoint[];
  height?: string;
  className?: string;
}

function FitBounds({ points }: { points: TrackPathPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const bounds = L.latLngBounds(
      points.map((p) => [p.location_lat, p.location_lng] as [number, number])
    );

    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, points]);

  return null;
}

export default function TrackPathMap({
  points,
  height = "300px",
  className,
}: TrackPathMapProps) {
  if (points.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border flex items-center justify-center text-muted-foreground text-sm",
          className
        )}
        style={{ height }}
      >
        No track points available
      </div>
    );
  }

  const polylinePositions = points.map(
    (p) => [p.location_lat, p.location_lng] as [number, number]
  );

  const defaultCenter: [number, number] = [
    points[0].location_lat,
    points[0].location_lng,
  ];

  return (
    <div
      className={cn("rounded-md overflow-hidden border", className)}
      style={{ height }}
    >
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <FitBounds points={points} />

        {/* Glow layer -- thicker, semi-transparent */}
        <Polyline
          positions={polylinePositions}
          pathOptions={{
            color: "oklch(0.75 0.15 195)",
            weight: 6,
            opacity: 0.3,
          }}
        />

        {/* Main path line */}
        <Polyline
          positions={polylinePositions}
          pathOptions={{
            color: "oklch(0.75 0.15 195)",
            weight: 2,
            opacity: 0.9,
          }}
        />

        {points.map((point, index) => (
          <CircleMarker
            key={`${point.camera_id}-${point.timestamp}-${index}`}
            center={[point.location_lat, point.location_lng]}
            radius={5}
            pathOptions={{
              color: "oklch(0.75 0.15 195)",
              fillColor: "oklch(0.75 0.15 195)",
              fillOpacity: 0.9,
              weight: 1,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1 min-w-[120px]">
                <p className="font-semibold text-sm">
                  {point.camera_name ?? point.camera_id}
                </p>
                <p className="text-muted-foreground">
                  {new Date(point.timestamp).toLocaleString()}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

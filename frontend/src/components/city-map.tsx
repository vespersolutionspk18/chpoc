"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { Camera } from "@/lib/types";
import { createCameraIcon } from "@/components/camera-marker";
import { cn } from "@/lib/utils";

// Fix Leaflet default icon issue in bundled environments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface CityMapProps {
  cameras?: Camera[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onCameraClick?: (camera: Camera) => void;
  className?: string;
  children?: React.ReactNode;
}

export default function CityMap({
  cameras = [],
  center = [34.15, 71.74],
  zoom = 13,
  height = "400px",
  onCameraClick,
  className,
  children,
}: CityMapProps) {
  return (
    <div className={cn("rounded-md overflow-hidden border", className)} style={{ height }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {cameras.map((camera) => (
          <CameraMarkerItem
            key={camera.id}
            camera={camera}
            onClick={onCameraClick}
          />
        ))}

        {children}
      </MapContainer>
    </div>
  );
}

function CameraMarkerItem({
  camera,
  onClick,
}: {
  camera: Camera;
  onClick?: (camera: Camera) => void;
}) {
  const icon = createCameraIcon(camera.status);

  return (
    <Marker
      position={[camera.location_lat, camera.location_lng]}
      icon={icon}
      eventHandlers={{
        click: () => {
          if (onClick) onClick(camera);
        },
      }}
    >
      <Popup>
        <div className="text-xs space-y-1 min-w-[140px]">
          <p className="font-semibold text-sm">{camera.name}</p>
          <p className="text-muted-foreground">ID: {camera.id}</p>
          {camera.zone_id && (
            <p className="text-muted-foreground">Zone: {camera.zone_id}</p>
          )}
          <p>
            Status:{" "}
            <span
              className={
                camera.status === "online"
                  ? "text-green-500"
                  : camera.status === "offline"
                    ? "text-red-500"
                    : "text-amber-500"
              }
            >
              {camera.status}
            </span>
          </p>
        </div>
      </Popup>
    </Marker>
  );
}

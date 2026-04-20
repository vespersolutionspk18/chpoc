"use client";

import { useState } from "react";
import type { Camera, Detection } from "@/lib/types";
import { StatusDot } from "@/components/status-dot";
import { DetectionOverlay } from "@/components/detection-overlay";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CameraFeedCardProps {
  camera: Camera;
  detections?: Detection[];
  onClick?: (camera: Camera) => void;
  compact?: boolean;
}

export function CameraFeedCard({
  camera,
  detections,
  onClick,
  compact = false,
}: CameraFeedCardProps) {
  const [streamError, setStreamError] = useState(false);

  return (
    <div
      onClick={() => onClick?.(camera)}
      className={cn(
        "hud-card group relative w-full overflow-hidden rounded-sm",
        "bg-gradient-to-br from-[#0a1525] to-[#060d1a]",
        "border border-[#00f0ff]/10 transition-all duration-200",
        "hover:border-[#00f0ff]/40 hover:shadow-[0_0_20px_#00f0ff15] hover:scale-[1.01]",
        onClick && "cursor-pointer"
      )}
    >
      {/* Camera feed area -- aspect-video fills parent width */}
      <div className="relative aspect-video w-full overflow-hidden">
        {/* Subtle grid-lines pattern overlay */}
        <div className="grid-lines pointer-events-none absolute inset-0 z-20 opacity-30" />

        {/* Native video playback — zero lag */}
        {!streamError ? (
          <video
            src={`${API_URL}/api/video/file/${camera.id}`}
            crossOrigin="anonymous"
            autoPlay
            loop
            muted
            playsInline
            preload="none"
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setStreamError(true)}
          />
        ) : (
          <>
            {/* Fallback: dark gradient when no video file */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a1525]/60 to-[#060d1a]/80" />
            {detections && detections.length > 0 && (
              <DetectionOverlay
                detections={detections}
                width={640}
                height={360}
              />
            )}
          </>
        )}

        {/* Top-left: camera name */}
        <div className="absolute left-2 top-2 z-30">
          <span className="font-data text-xs text-[#00f0ff]/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {camera.name}
          </span>
        </div>

        {/* Top-right: status dot */}
        <div className="absolute right-2 top-2 z-30">
          <StatusDot status={camera.status} size="sm" />
        </div>

        {/* Bottom-left: detection count badge */}
        {detections && detections.length > 0 && (
          <div className="absolute bottom-2 left-2 z-30">
            <span className="inline-flex items-center rounded-sm bg-[#00f0ff]/10 px-1.5 py-0.5 font-data text-[10px] text-[#00f0ff] backdrop-blur-sm">
              {detections.length} DET
            </span>
          </div>
        )}

        {/* Bottom-right: LIVE indicator when online */}
        {camera.status === "online" && (
          <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#ff2d78] shadow-[0_0_4px_#ff2d78]" />
            <span className="font-data text-[10px] text-[#ff2d78]">LIVE</span>
          </div>
        )}

        {/* Bottom-center: camera ID */}
        <div className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2">
          <span className="font-data text-[10px] text-[#4a6a8a] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {camera.id}
          </span>
        </div>
      </div>

      {/* Zone label bar */}
      {camera.zone_id && (
        <div className="flex items-center justify-end border-t border-[#00f0ff]/5 px-3 py-1.5">
          <span className="rounded-sm bg-[#00f0ff]/8 px-1.5 py-0.5 font-data text-[10px] uppercase tracking-wider text-[#00f0ff]/50">
            {camera.zone_id}
          </span>
        </div>
      )}
    </div>
  );
}

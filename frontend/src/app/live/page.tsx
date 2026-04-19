"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid2x2, Grid3x3, LayoutGrid, X } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { CameraFeedCard } from "@/components/camera-feed-card";
import { DetectionOverlay } from "@/components/detection-overlay";
import { SeverityBadge } from "@/components/severity-badge";
import { StatusDot } from "@/components/status-dot";
import { MOCK_CAMERAS, MOCK_ALERTS } from "@/lib/mock-data";
import type { Camera, Detection } from "@/lib/types";

// ---------------------------------------------------------------------------
// Inline mock detections
// ---------------------------------------------------------------------------

const MOCK_DETECTIONS: Detection[] = [
  { id: "det-001", object_type: "person", confidence: 0.92, bbox: { x: 80, y: 120, width: 100, height: 240 }, track_id: "trk-5001", attributes: null },
  { id: "det-002", object_type: "person", confidence: 0.87, bbox: { x: 360, y: 160, width: 90, height: 220 }, track_id: "trk-5002", attributes: null },
  { id: "det-003", object_type: "vehicle", confidence: 0.95, bbox: { x: 500, y: 280, width: 240, height: 160 }, track_id: "trk-5003", attributes: null },
  { id: "det-004", object_type: "person", confidence: 0.78, bbox: { x: 200, y: 100, width: 80, height: 200 }, track_id: "trk-5004", attributes: null },
];

// ---------------------------------------------------------------------------
// Grid config
// ---------------------------------------------------------------------------

const GRID_CONFIG = {
  "2x2": { cols: "grid-cols-2", count: 4 },
  "3x3": { cols: "grid-cols-3", count: 9 },
  "4x4": { cols: "grid-cols-4", count: 16 },
} as const;

type GridLayout = keyof typeof GRID_CONFIG;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LiveViewPage() {
  const [gridLayout, setGridLayout] = useState<GridLayout>("2x2");
  const [fullscreenCamera, setFullscreenCamera] = useState<Camera | null>(null);

  const config = GRID_CONFIG[gridLayout];
  const visibleCameras = MOCK_CAMERAS.slice(0, config.count);

  const fullscreenAlerts = fullscreenCamera
    ? MOCK_ALERTS.filter((a) => a.camera_id === fullscreenCamera.id).slice(0, 4)
    : [];

  const layoutButtons: { layout: GridLayout; icon: typeof Grid2x2; label: string }[] = [
    { layout: "2x2", icon: Grid2x2, label: "2x2" },
    { layout: "3x3", icon: Grid3x3, label: "3x3" },
    { layout: "4x4", icon: LayoutGrid, label: "4x4" },
  ];

  return (
    <>
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" as const }}
      >
        {/* Header */}
        <PageHeader title="LIVE SURVEILLANCE" description="Real-time multi-camera monitoring grid">
          <div className="flex items-center gap-1 rounded-sm border border-[#00f0ff]/20 bg-[#030712]/80 p-0.5">
            {layoutButtons.map(({ layout, icon: Icon, label }) => (
              <button
                key={layout}
                onClick={() => setGridLayout(layout)}
                className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-heading text-[10px] uppercase tracking-wider transition-all ${
                  gridLayout === layout
                    ? "bg-[#00f0ff]/15 text-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.2)]"
                    : "text-[#4a6a8a] hover:text-[#00f0ff]/60"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </PageHeader>

        {/* Camera grid */}
        <div className={`grid gap-1.5 ${config.cols}`}>
          {visibleCameras.map((camera, idx) => (
            <CameraFeedCard
              key={camera.id}
              camera={camera}
              detections={idx < MOCK_DETECTIONS.length ? [MOCK_DETECTIONS[idx]] : undefined}
              onClick={(cam) => setFullscreenCamera(cam)}
            />
          ))}
        </div>
      </motion.div>

      {/* ================================================================== */}
      {/* FULLSCREEN OVERLAY — no Dialog component, pure portal-free overlay */}
      {/* ================================================================== */}
      <AnimatePresence>
        {fullscreenCamera && (
          <motion.div
            key="fullscreen-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex flex-col"
            style={{ background: "#030712" }}
          >
            {/* Backdrop click to close */}

            {/* Top bar */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#00f0ff]/15 bg-[#020a18] px-5">
              <div className="flex items-center gap-3">
                <StatusDot status={fullscreenCamera.status} size="md" />
                <span className="font-heading text-sm uppercase tracking-[0.15em] text-[#00f0ff]">
                  {fullscreenCamera.name}
                </span>
                <span className="rounded-sm border border-[#00f0ff]/20 bg-[#00f0ff]/5 px-2 py-0.5 font-data text-[10px] text-[#00f0ff]/70">
                  {fullscreenCamera.id}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <InfoPill label="SECTOR" value={fullscreenCamera.zone_id ?? "N/A"} />
                <InfoPill label="STATUS" value={fullscreenCamera.status.toUpperCase()} />
                <InfoPill label="COORD" value={`${fullscreenCamera.location_lat.toFixed(4)}, ${fullscreenCamera.location_lng.toFixed(4)}`} />

                <button
                  onClick={() => setFullscreenCamera(null)}
                  className="ml-2 rounded-sm border border-[#ff2d78]/30 bg-[#ff2d78]/10 p-1.5 text-[#ff2d78] transition-colors hover:bg-[#ff2d78]/20"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Camera feed — fills all remaining space */}
            <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-[#0a1525] to-[#060d1a]">
              {/* Grid pattern */}
              <div className="grid-lines pointer-events-none absolute inset-0 opacity-15" />

              {/* Detection boxes */}
              <DetectionOverlay
                detections={MOCK_DETECTIONS.slice(0, 3)}
                width={1920}
                height={1080}
              />

              {/* HUD: top-left — camera name */}
              <div className="absolute left-5 top-5 z-20">
                <span className="font-data text-sm text-[#00f0ff]/60">{fullscreenCamera.name}</span>
              </div>

              {/* HUD: top-right — LIVE */}
              <div className="absolute right-5 top-5 z-20 flex items-center gap-1.5">
                <span className="inline-block size-2.5 animate-pulse rounded-full bg-[#ff2d78] shadow-[0_0_8px_#ff2d78]" />
                <span className="font-heading text-[10px] tracking-wider text-[#ff2d78]">LIVE</span>
              </div>

              {/* HUD: bottom-left — stats */}
              <div className="absolute bottom-5 left-5 z-20 flex gap-2">
                <HudStat label="TARGETS" value="3" color="#00f0ff" />
                <HudStat label="VEHICLES" value="1" color="#00ff88" />
                <HudStat label="FPS" value="30" color="#ffaa00" />
                <HudStat label="LATENCY" value="42ms" color="#00ff88" />
              </div>

              {/* HUD: bottom-right — recent threats */}
              {fullscreenAlerts.length > 0 && (
                <div className="absolute bottom-5 right-5 z-20 w-80 space-y-1">
                  <span className="font-heading text-[8px] uppercase tracking-[0.25em] text-[#4a6a8a]">
                    RECENT THREATS
                  </span>
                  {fullscreenAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between rounded-sm border border-white/5 bg-[#020a18]/80 px-3 py-1.5 backdrop-blur-sm"
                    >
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={alert.severity} />
                        <span className="font-heading text-[9px] uppercase tracking-wider text-slate-300">
                          {alert.alert_type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className="font-data text-[9px] text-[#4a6a8a]">
                        {alert.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[#00f0ff]/10 bg-[#00f0ff]/[0.03] px-3 py-1">
      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">{label}</span>
      <p className="font-data text-[11px] text-slate-300">{value}</p>
    </div>
  );
}

function HudStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-sm border border-white/5 bg-[#020a18]/80 px-3 py-1.5 text-center backdrop-blur-sm">
      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">{label}</span>
      <p className="font-data text-sm" style={{ color }}>{value}</p>
    </div>
  );
}

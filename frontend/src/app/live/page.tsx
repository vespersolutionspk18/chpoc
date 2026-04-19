"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid2x2, Grid3x3, LayoutGrid, X, Play, Square } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { CameraFeedCard } from "@/components/camera-feed-card";
import { DetectionOverlay } from "@/components/detection-overlay";
import { SeverityBadge } from "@/components/severity-badge";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { MOCK_CAMERAS, MOCK_ALERTS } from "@/lib/mock-data";
import {
  getCameras,
  getAlerts,
  getAllFrames,
  startPipeline,
  stopPipeline,
  getPipelineStatus,
} from "@/lib/api";
import type { Camera, Detection } from "@/lib/types";
import type { FrameData } from "@/lib/api";

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
  const [cameras, setCameras] = useState<Camera[]>(MOCK_CAMERAS);
  const [frameData, setFrameData] = useState<Record<string, FrameData>>({});
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);

  // Load cameras from API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [camerasData, alertsData] = await Promise.all([
          getCameras(),
          getAlerts({ limit: 50 }),
        ]);
        if (!cancelled) {
          setCameras(camerasData);
          setAlerts(alertsData);
        }
      } catch {
        // Keep mock data
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Check pipeline status on mount
  useEffect(() => {
    async function checkPipeline() {
      try {
        const status = await getPipelineStatus();
        const anyRunning = Object.values(status).some((s) => s.running);
        setPipelineRunning(anyRunning);
      } catch {
        // Pipeline status unavailable
      }
    }
    checkPipeline();
  }, []);

  // Poll /api/frames every 2 seconds for live detection data
  useEffect(() => {
    async function fetchFrames() {
      try {
        const data = await getAllFrames();
        setFrameData(data);
      } catch {
        // Keep current frame data on failure
      }
    }
    fetchFrames();
    const interval = setInterval(fetchFrames, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleTogglePipeline = useCallback(async () => {
    setPipelineLoading(true);
    try {
      if (pipelineRunning) {
        await stopPipeline();
        setPipelineRunning(false);
      } else {
        await startPipeline();
        setPipelineRunning(true);
      }
    } catch (err) {
      console.warn("Pipeline toggle failed:", err);
    } finally {
      setPipelineLoading(false);
    }
  }, [pipelineRunning]);

  const config = GRID_CONFIG[gridLayout];
  const visibleCameras = cameras.slice(0, config.count);

  // Get detections for a camera from live frame data
  function getCameraDetections(cameraId: string): Detection[] {
    const frame = frameData[cameraId];
    return frame?.detections ?? [];
  }

  // Check if a camera has recent frame data (active)
  function isCameraActive(cameraId: string): boolean {
    return cameraId in frameData;
  }

  const fullscreenAlerts = fullscreenCamera
    ? alerts.filter((a) => a.camera_id === fullscreenCamera.id).slice(0, 4)
    : [];

  const fullscreenDetections = fullscreenCamera
    ? getCameraDetections(fullscreenCamera.id)
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
          <div className="flex items-center gap-3">
            {/* Pipeline toggle */}
            <Button
              size="sm"
              disabled={pipelineLoading}
              onClick={handleTogglePipeline}
              className={`gap-1.5 rounded-sm border font-heading text-[10px] uppercase tracking-wider ${
                pipelineRunning
                  ? "border-[#ff2d78]/30 bg-[#ff2d78]/10 text-[#ff2d78] hover:bg-[#ff2d78]/20"
                  : "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20"
              }`}
            >
              {pipelineRunning ? (
                <Square className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
              {pipelineLoading
                ? "..."
                : pipelineRunning
                  ? "STOP"
                  : "START"}
            </Button>

            {pipelineRunning && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2 animate-pulse rounded-full bg-[#00ff88] shadow-[0_0_6px_#00ff88]" />
                <span className="font-heading text-[10px] uppercase tracking-wider text-[#00ff88]">
                  LIVE
                </span>
              </span>
            )}

            {/* Grid layout selector */}
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
          </div>
        </PageHeader>

        {/* Camera grid */}
        <div className={`grid gap-1.5 ${config.cols}`}>
          {visibleCameras.map((camera) => {
            const detections = getCameraDetections(camera.id);
            const active = isCameraActive(camera.id);
            return (
              <div key={camera.id} className="relative">
                <CameraFeedCard
                  camera={camera}
                  detections={detections.length > 0 ? detections : undefined}
                  onClick={(cam) => setFullscreenCamera(cam)}
                />
                {/* Active indicator overlay */}
                {active && (
                  <div className="absolute top-2 left-12 z-30">
                    <span className="inline-flex items-center gap-1 rounded-sm bg-[#00ff88]/10 px-1.5 py-0.5 font-data text-[9px] text-[#00ff88] backdrop-blur-sm">
                      <span className="inline-block size-1.5 animate-pulse rounded-full bg-[#00ff88]" />
                      {detections.length} DET
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ================================================================== */}
      {/* FULLSCREEN OVERLAY -- no Dialog component, pure portal-free overlay */}
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

            {/* Camera feed -- fills all remaining space */}
            <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-[#0a1525] to-[#060d1a]">
              {/* Grid pattern */}
              <div className="grid-lines pointer-events-none absolute inset-0 opacity-15" />

              {/* Detection boxes from live data */}
              <DetectionOverlay
                detections={fullscreenDetections.slice(0, 20)}
                width={1920}
                height={1080}
              />

              {/* HUD: top-left -- camera name */}
              <div className="absolute left-5 top-5 z-20">
                <span className="font-data text-sm text-[#00f0ff]/60">{fullscreenCamera.name}</span>
              </div>

              {/* HUD: top-right -- LIVE */}
              <div className="absolute right-5 top-5 z-20 flex items-center gap-1.5">
                <span className="inline-block size-2.5 animate-pulse rounded-full bg-[#ff2d78] shadow-[0_0_8px_#ff2d78]" />
                <span className="font-heading text-[10px] tracking-wider text-[#ff2d78]">LIVE</span>
              </div>

              {/* HUD: bottom-left -- stats from real data */}
              <div className="absolute bottom-5 left-5 z-20 flex gap-2">
                <HudStat
                  label="TARGETS"
                  value={String(fullscreenDetections.filter((d) => d.object_type === "person").length)}
                  color="#00f0ff"
                />
                <HudStat
                  label="VEHICLES"
                  value={String(fullscreenDetections.filter((d) => d.object_type === "vehicle").length)}
                  color="#00ff88"
                />
                <HudStat
                  label="TOTAL"
                  value={String(fullscreenDetections.length)}
                  color="#ffaa00"
                />
                <HudStat label="FPS" value="30" color="#00ff88" />
              </div>

              {/* HUD: bottom-right -- recent threats */}
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

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid2x2, Grid3x3, LayoutGrid, Play, Square } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { CameraFeedCard } from "@/components/camera-feed-card";
import { InteractiveCameraViewer } from "@/components/interactive-camera-viewer";
import { Button } from "@/components/ui/button";
import {
  getCameras,
  getAlerts,
  getAllFrames,
  startPipeline,
  stopPipeline,
  getPipelineStatus,
} from "@/lib/api";
import { PageSkeleton } from "@/components/page-skeleton";
import type { Alert, Camera, Detection } from "@/lib/types";
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
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [frameData, setFrameData] = useState<Record<string, FrameData>>({});
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

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
      } catch (err) {
        console.error("[LiveView] Failed to fetch cameras/alerts:", err);
      } finally {
        if (!cancelled) setLoading(false);
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

  const layoutButtons: { layout: GridLayout; icon: typeof Grid2x2; label: string }[] = [
    { layout: "2x2", icon: Grid2x2, label: "2x2" },
    { layout: "3x3", icon: Grid3x3, label: "3x3" },
    { layout: "4x4", icon: LayoutGrid, label: "4x4" },
  ];

  if (loading) {
    return <PageSkeleton />;
  }

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
      {/* INTERACTIVE CAMERA VIEWER -- replaces old MJPEG fullscreen overlay */}
      {/* ================================================================== */}
      <AnimatePresence>
        {fullscreenCamera && (
          <InteractiveCameraViewer
            camera={fullscreenCamera}
            onClose={() => setFullscreenCamera(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}


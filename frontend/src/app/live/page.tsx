"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid2x2, Grid3x3, LayoutGrid, Play, Square, HardDrive } from "lucide-react";

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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface NvrFile {
  filename: string;
  camera_id: string;
  camera_name: string;
  size_mb: number;
}

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
  const [fullscreenVideoUrl, setFullscreenVideoUrl] = useState<string | undefined>(undefined);
  const [fullscreenVideoUrlHq, setFullscreenVideoUrlHq] = useState<string | undefined>(undefined);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [frameData, setFrameData] = useState<Record<string, FrameData>>({});
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [nvrFiles, setNvrFiles] = useState<NvrFile[]>([]);

  // Load NVR recordings list
  useEffect(() => {
    async function loadNvr() {
      try {
        const resp = await fetch(`${API_URL}/api/video/nvr/list`);
        if (resp.ok) {
          const data = await resp.json();
          setNvrFiles(data.files ?? []);
        }
      } catch {
        // NVR list unavailable
      }
    }
    loadNvr();
  }, []);

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

        {/* Camera grid — hidden when fullscreen is open (frees video connections) */}
        <div className={`grid gap-1.5 ${config.cols} ${fullscreenCamera ? "hidden" : ""}`}>
          {visibleCameras.map((camera) => {
            const detections = getCameraDetections(camera.id);
            const active = isCameraActive(camera.id);
            return (
              <div key={camera.id} className="relative">
                <CameraFeedCard
                  camera={camera}
                  detections={detections.length > 0 ? detections : undefined}
                  onClick={(cam) => { setFullscreenVideoUrl(undefined); setFullscreenCamera(cam); }}
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
        {/* ============================================================== */}
        {/* NVR RECORDINGS — raw camera feeds below the analysis grid      */}
        {/* ============================================================== */}
        {nvrFiles.length > 0 && !fullscreenCamera && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-[#ff8800]" />
              <h2 className="font-heading text-sm uppercase tracking-wider text-[#ff8800]">
                NVR RECORDINGS
              </h2>
              <span className="font-data text-[10px] text-[#4a6a8a]">
                {nvrFiles.length} clips
              </span>
            </div>

            <div className="grid gap-1.5 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {nvrFiles.map((nvr) => (
                <div
                  key={nvr.filename}
                  onClick={() => {
                    const pseudoCamera: Camera = {
                      id: nvr.camera_id,
                      name: nvr.camera_name,
                      location_lat: 0,
                      location_lng: 0,
                      zone_id: `NVR / ${nvr.filename}`,
                      stream_url: "",
                      status: "online",
                      analytics_profile: null,
                      created_at: "",
                      updated_at: "",
                    };
                    setFullscreenVideoUrl(`${API_URL}/api/video/nvr/file/${nvr.filename}`);
                    setFullscreenVideoUrlHq(`${API_URL}/api/video/nvr/file-hq/${nvr.filename}`);
                    setFullscreenCamera(pseudoCamera);
                  }}
                  className="group relative w-full overflow-hidden rounded-sm bg-gradient-to-br from-[#0a1525] to-[#060d1a] border border-[#ff8800]/10 transition-all duration-200 hover:border-[#ff8800]/40 hover:shadow-[0_0_20px_#ff880015] cursor-pointer"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-[#0d1520] to-[#080e18] flex items-center justify-center">
                    <div className="grid-lines pointer-events-none absolute inset-0 z-20 opacity-30" />
                    {/* NO video element — just a clickable card. Video loads only in fullscreen viewer */}
                    <div className="flex flex-col items-center gap-1 z-10">
                      <HardDrive className="size-6 text-[#ff8800]/40" />
                      <span className="font-heading text-[9px] uppercase tracking-wider text-[#ff8800]/60">CLICK TO PLAY</span>
                    </div>
                    {/* Camera name */}
                    <div className="absolute left-2 top-2 z-30">
                      <span className="font-data text-xs text-[#ff8800]/80">
                        {nvr.camera_name}
                      </span>
                    </div>
                    {/* NVR badge */}
                    <div className="absolute right-2 top-2 z-30">
                      <span className="inline-flex items-center gap-1 rounded-sm bg-[#ff8800]/10 px-1.5 py-0.5 font-data text-[9px] text-[#ff8800] backdrop-blur-sm">
                        <HardDrive className="size-2.5" />
                        NVR
                      </span>
                    </div>
                    {/* Filename + size */}
                    <div className="absolute bottom-2 left-2 z-30">
                      <span className="font-data text-[10px] text-[#4a6a8a]">
                        {nvr.filename}
                      </span>
                    </div>
                    <div className="absolute bottom-2 right-2 z-30">
                      <span className="font-data text-[10px] text-[#4a6a8a]">
                        {nvr.size_mb}MB
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* ================================================================== */}
      {/* INTERACTIVE CAMERA VIEWER -- replaces old MJPEG fullscreen overlay */}
      {/* ================================================================== */}
      <AnimatePresence>
        {fullscreenCamera && (
          <InteractiveCameraViewer
            camera={fullscreenCamera}
            onClose={() => { setFullscreenCamera(null); setFullscreenVideoUrl(undefined); setFullscreenVideoUrlHq(undefined); }}
            videoUrlOverride={fullscreenVideoUrl}
            videoUrlHq={fullscreenVideoUrlHq}
          />
        )}
      </AnimatePresence>
    </>
  );
}


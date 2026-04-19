"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Pause, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Camera } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Detection {
  track_id: number;
  object_class: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

interface AnalysisResult {
  type: string;
  face?: {
    face_bbox: { x: number; y: number; w: number; h: number };
    quality_score: number;
    embedding: number[] | null;
  } | null;
  plate?: {
    plate_text: string;
    confidence: number;
    plate_bbox: { x: number; y: number; w: number; h: number };
  } | null;
  attributes: Record<string, unknown>;
}

interface InteractiveCameraViewerProps {
  camera: Camera;
  onClose: () => void;
}

export function InteractiveCameraViewer({ camera, onClose }: InteractiveCameraViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [videoSize, setVideoSize] = useState({ width: 1280, height: 720 });

  const videoUrl = `${API_URL}/api/video/file/${camera.id}`;

  // Run detection every 2 seconds while playing
  useEffect(() => {
    if (paused) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.paused || video.ended) return;

      // Capture current frame to canvas
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Send frame to backend for detection
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const form = new FormData();
        form.append("image", blob, "frame.jpg");
        form.append("camera_id", camera.id);
        try {
          const resp = await fetch(`${API_URL}/api/video/detect-frame`, {
            method: "POST",
            body: form,
          });
          if (resp.ok) {
            const dets = await resp.json();
            setDetections(dets);
          }
        } catch {
          // Detection request failed -- keep previous detections
        }
      }, "image/jpeg", 0.7);
    }, 2000);

    return () => clearInterval(interval);
  }, [paused, camera.id]);

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    }
  }, []);

  // Toggle pause
  const togglePause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPaused(false);
      setSelectedDetection(null);
      setAnalysisResult(null);
    } else {
      video.pause();
      setPaused(true);
    }
  }, []);

  // Click on a detection box
  const handleDetectionClick = useCallback(async (det: Detection) => {
    // Pause video
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
      setPaused(true);
    }

    setSelectedDetection(det);
    setAnalyzing(true);
    setAnalysisResult(null);

    // Capture the crop from the current frame
    const canvas = canvasRef.current;
    if (!canvas || !video) { setAnalyzing(false); return; }

    const ctx = canvas.getContext("2d");
    if (!ctx) { setAnalyzing(false); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Crop the detection area
    const { x, y, w, h } = det.bbox;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, Math.round(w));
    cropCanvas.height = Math.max(1, Math.round(h));
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) { setAnalyzing(false); return; }
    cropCtx.drawImage(canvas, x, y, w, h, 0, 0, cropCanvas.width, cropCanvas.height);

    // Send crop for analysis
    cropCanvas.toBlob(async (blob) => {
      if (!blob) { setAnalyzing(false); return; }
      const form = new FormData();
      form.append("image", blob, "crop.jpg");

      const endpoint = det.object_class === "person"
        ? `${API_URL}/api/video/analyze-person`
        : `${API_URL}/api/video/analyze-vehicle`;

      try {
        const resp = await fetch(endpoint, { method: "POST", body: form });
        if (resp.ok) {
          const result = await resp.json();
          setAnalysisResult(result);
        }
      } catch (err) {
        console.error("Analysis failed:", err);
      } finally {
        setAnalyzing(false);
      }
    }, "image/jpeg", 0.9);
  }, []);

  // Map detection colors
  const detColor = (cls: string) => {
    switch (cls) {
      case "person": return "#00f0ff";
      case "vehicle": return "#00ff88";
      case "bike": return "#ffaa00";
      case "bag": return "#ff2d78";
      default: return "#888";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex bg-[#030712]"
    >
      {/* Video area -- left side */}
      <div className="relative flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex h-12 items-center justify-between border-b border-[#00f0ff]/15 bg-[#020a18] px-4">
          <div className="flex items-center gap-3">
            <span className="font-heading text-sm uppercase tracking-[0.15em] text-[#00f0ff]">
              {camera.name}
            </span>
            <span className="rounded-sm border border-[#00f0ff]/20 bg-[#00f0ff]/5 px-2 py-0.5 font-data text-[10px] text-[#00f0ff]/70">
              {camera.id.slice(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={togglePause}
              className="rounded-sm border border-[#00f0ff]/20 bg-[#00f0ff]/5 p-1.5 text-[#00f0ff] hover:bg-[#00f0ff]/10"
            >
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            </button>
            <button
              onClick={onClose}
              className="rounded-sm border border-[#ff2d78]/30 bg-[#ff2d78]/10 p-1.5 text-[#ff2d78] hover:bg-[#ff2d78]/20"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Video + detection overlays */}
        <div ref={containerRef} className="relative flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            crossOrigin="anonymous"
            autoPlay
            loop
            muted
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            className="absolute inset-0 w-full h-full object-contain"
          />

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Interactive detection overlays */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${videoSize.width} ${videoSize.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {detections.map((det, i) => {
              const isSelected = selectedDetection?.track_id === det.track_id;
              const color = detColor(det.object_class);
              return (
                <g key={det.track_id ?? i} className="pointer-events-auto cursor-pointer" onClick={() => handleDetectionClick(det)}>
                  <rect
                    x={det.bbox.x}
                    y={det.bbox.y}
                    width={det.bbox.w}
                    height={det.bbox.h}
                    stroke={color}
                    strokeWidth={isSelected ? 3 : 2}
                    fill={isSelected ? `${color}22` : "transparent"}
                    rx={2}
                    className="transition-all hover:fill-[rgba(0,240,255,0.1)]"
                  />
                  {/* Small label */}
                  <text
                    x={det.bbox.x + 4}
                    y={det.bbox.y - 4}
                    fill={color}
                    fontSize={12}
                    fontFamily="'JetBrains Mono', monospace"
                    className="select-none"
                  >
                    {det.object_class} {(det.confidence * 100).toFixed(0)}%
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Paused indicator */}
          {paused && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded-sm bg-[#ff2d78]/80 px-3 py-1 font-heading text-[10px] uppercase tracking-wider text-white">
              PAUSED -- Click any detection to analyze
            </div>
          )}

          {/* Detection count HUD */}
          <div className="absolute bottom-4 left-4 z-20 flex gap-2">
            <div className="rounded-sm border border-white/10 bg-[#020a18]/80 px-3 py-1 backdrop-blur-sm">
              <span className="font-heading text-[8px] uppercase tracking-wider text-[#4a6a8a]">DETECTIONS</span>
              <p className="font-data text-sm text-[#00f0ff]">{detections.length}</p>
            </div>
            <div className="rounded-sm border border-white/10 bg-[#020a18]/80 px-3 py-1 backdrop-blur-sm">
              <span className="font-heading text-[8px] uppercase tracking-wider text-[#4a6a8a]">PERSONS</span>
              <p className="font-data text-sm text-[#00f0ff]">{detections.filter(d => d.object_class === "person").length}</p>
            </div>
            <div className="rounded-sm border border-white/10 bg-[#020a18]/80 px-3 py-1 backdrop-blur-sm">
              <span className="font-heading text-[8px] uppercase tracking-wider text-[#4a6a8a]">VEHICLES</span>
              <p className="font-data text-sm text-[#00ff88]">{detections.filter(d => d.object_class === "vehicle").length}</p>
            </div>
          </div>

          {/* LIVE indicator */}
          {!paused && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
              <span className="inline-block size-2.5 animate-pulse rounded-full bg-[#ff2d78] shadow-[0_0_8px_#ff2d78]" />
              <span className="font-heading text-[10px] tracking-wider text-[#ff2d78]">LIVE</span>
            </div>
          )}
        </div>
      </div>

      {/* Analysis panel -- right side */}
      <AnimatePresence>
        {(selectedDetection || analysisResult) && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full border-l border-[#00f0ff]/15 bg-[#020a18] overflow-y-auto"
          >
            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-xs uppercase tracking-widest text-[#00f0ff]">
                  {selectedDetection?.object_class === "person" ? "PERSON ANALYSIS" : "VEHICLE ANALYSIS"}
                </h3>
                <button
                  onClick={() => { setSelectedDetection(null); setAnalysisResult(null); }}
                  className="text-[#4a6a8a] hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Detection info */}
              {selectedDetection && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <InfoCell label="TYPE" value={selectedDetection.object_class.toUpperCase()} color={detColor(selectedDetection.object_class)} />
                    <InfoCell label="CONFIDENCE" value={`${(selectedDetection.confidence * 100).toFixed(1)}%`} />
                    <InfoCell label="POSITION" value={`${Math.round(selectedDetection.bbox.x)}, ${Math.round(selectedDetection.bbox.y)}`} />
                    <InfoCell label="SIZE" value={`${Math.round(selectedDetection.bbox.w)} x ${Math.round(selectedDetection.bbox.h)}`} />
                  </div>
                </div>
              )}

              {/* Loading */}
              {analyzing && (
                <div className="flex items-center gap-2 py-4">
                  <div className="size-4 animate-spin rounded-full border-2 border-[#00f0ff]/30 border-t-[#00f0ff]" />
                  <span className="font-data text-xs text-[#4a6a8a]">Analyzing with AI models...</span>
                </div>
              )}

              {/* Analysis results */}
              {analysisResult && (
                <div className="space-y-3">
                  <div className="h-px bg-gradient-to-r from-[#00f0ff]/30 to-transparent" />

                  {/* Face analysis */}
                  {analysisResult.face && (
                    <div className="space-y-2">
                      <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">FACE DETECTED</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <InfoCell label="QUALITY" value={`${(analysisResult.face.quality_score * 100).toFixed(0)}%`} />
                        <InfoCell label="EMBEDDING" value={analysisResult.face.embedding ? `${analysisResult.face.embedding.length}-d` : "N/A"} />
                        <InfoCell label="FACE POS" value={`${Math.round(analysisResult.face.face_bbox.x)}, ${Math.round(analysisResult.face.face_bbox.y)}`} />
                        <InfoCell label="FACE SIZE" value={`${Math.round(analysisResult.face.face_bbox.w)} x ${Math.round(analysisResult.face.face_bbox.h)}`} />
                      </div>
                      {analysisResult.face.embedding && (
                        <p className="font-data text-[9px] text-[#4a6a8a]">
                          Face embedding captured -- can be used for search and matching
                        </p>
                      )}
                    </div>
                  )}

                  {/* Plate analysis */}
                  {analysisResult.plate && (
                    <div className="space-y-2">
                      <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">PLATE DETECTED</h4>
                      <div className="rounded-sm border border-[#00ff88]/20 bg-[#00ff88]/5 p-3 text-center">
                        <span className="font-data text-xl text-[#00ff88]">{analysisResult.plate.plate_text}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <InfoCell label="CONFIDENCE" value={`${(analysisResult.plate.confidence * 100).toFixed(0)}%`} />
                        <InfoCell label="PLATE POS" value={`${Math.round(analysisResult.plate.plate_bbox.x)}, ${Math.round(analysisResult.plate.plate_bbox.y)}`} />
                      </div>
                    </div>
                  )}

                  {/* No face/plate found */}
                  {!analysisResult.face && !analysisResult.plate && (
                    <p className="py-4 text-center font-data text-xs text-[#4a6a8a]">
                      {analysisResult.type === "person" ? "No face detected in this crop" : "No plate detected in this crop"}
                    </p>
                  )}

                  {/* Camera info */}
                  <div className="h-px bg-gradient-to-r from-[#00f0ff]/20 to-transparent" />
                  <div className="space-y-2">
                    <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#4a6a8a]">SOURCE</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <InfoCell label="CAMERA" value={camera.name} />
                      <InfoCell label="ZONE" value={camera.zone_id ?? "N/A"} />
                      <InfoCell label="STATUS" value={camera.status.toUpperCase()} />
                      <InfoCell label="COORDS" value={`${camera.location_lat.toFixed(4)}, ${camera.location_lng.toFixed(4)}`} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function InfoCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-sm border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">{label}</span>
      <p className="font-data text-[11px] truncate" style={{ color: color ?? "#e0f0ff" }}>{value}</p>
    </div>
  );
}

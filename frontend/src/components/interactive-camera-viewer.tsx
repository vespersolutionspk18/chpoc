"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Camera } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Detection {
  track_id: number;
  object_class: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
}

// Attributes are now dynamic — VLM returns whatever it can see

interface AnalysisResult {
  type: string;
  description?: string;
  person_image_b64?: string;
  face?: {
    face_bbox: { x: number; y: number; w: number; h: number };
    quality_score: number;
    embedding: number[] | null;
  } | null;
  face_image_b64?: string | null;
  vehicle_image_b64?: string;
  plate?: {
    plate_text: string;
    confidence: number;
    plate_bbox: { x: number; y: number; w: number; h: number };
    plate_image_b64?: string | null;
  } | null;
  attributes: Record<string, unknown>;
}

interface Props {
  camera: Camera;
  onClose: () => void;
}

export function InteractiveCameraViewer({ camera, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedDet, setSelectedDet] = useState<Detection | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoSize, setVideoSize] = useState({ w: 1280, h: 720 });
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoUrl = `${API_URL}/api/video/file/${camera.id}`;

  // Capture current frame as blob — downscale to 640px wide for faster upload
  const captureFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        resolve(null);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      // Downscale to 640px wide for faster upload through tunnel
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.5);
    });
  }, []);

  // Run detection on current frame
  const runDetection = useCallback(async () => {
    const blob = await captureFrame();
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
        const dets: Detection[] = await resp.json();
        // Scale detection boxes back to full video resolution
        // (we sent a downscaled frame for speed)
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && canvas.width > 0) {
          const sx = video.videoWidth / canvas.width;
          const sy = video.videoHeight / canvas.height;
          for (const d of dets) {
            d.bbox.x *= sx;
            d.bbox.y *= sy;
            d.bbox.w *= sx;
            d.bbox.h *= sy;
          }
        }
        setDetections(dets);
        setError(null);
      } else {
        setError(`Detection failed: ${resp.status}`);
      }
    } catch (e) {
      setError(`Detection error: ${e}`);
    }
  }, [camera.id, captureFrame]);

  // Poll detections — wait for each request to complete before starting next
  useEffect(() => {
    if (!videoReady || paused) return;
    let active = true;

    async function loop() {
      while (active) {
        await runDetection();
        // No artificial delay — poll as fast as the round trip allows
      }
    }
    loop();
    return () => { active = false; };
  }, [videoReady, paused, runDetection]);

  // Video loaded
  const onVideoReady = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      setVideoSize({ w: v.videoWidth, h: v.videoHeight });
      setDuration(v.duration || 0);
      setVideoReady(true);
    }
  }, []);

  // Track time
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    return () => { v.removeEventListener("timeupdate", onTime); v.removeEventListener("durationchange", onDur); };
  }, []);

  // Play/pause toggle
  const togglePause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPaused(false);
      setSelectedDet(null);
      setAnalysis(null);
    } else {
      v.pause();
      setPaused(true);
      runDetection();
    }
  }, [runDetection]);

  // Frame step (forward/backward)
  const stepFrame = useCallback((dir: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) { v.pause(); setPaused(true); }
    // Assume ~25fps
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + dir / 25));
    setCurrentTime(v.currentTime);
    runDetection();
  }, [runDetection]);

  // Seek
  const onSeek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setCurrentTime(t);
    if (paused) runDetection();
  }, [paused, runDetection]);

  // Click on video → toggle pause
  const onVideoClick = useCallback(() => {
    togglePause();
  }, [togglePause]);

  // Click a detection box → analyze
  const onDetClick = useCallback(async (det: Detection, e: React.MouseEvent) => {
    e.stopPropagation();

    // Pause
    const v = videoRef.current;
    if (v && !v.paused) {
      v.pause();
      setPaused(true);
    }

    setSelectedDet(det);
    setAnalyzing(true);
    setAnalysis(null);

    // Capture and crop
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) { setAnalyzing(false); return; }

    const ctx = canvas.getContext("2d");
    if (!ctx) { setAnalyzing(false); return; }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    let { x: cx, y: cy, w: cw, h: ch } = det.bbox;

    // For persons: pad 20% above (hats) and 5% sides; for vehicles: pad 10% all sides (plates)
    if (det.object_class === "person") {
      const padTop = ch * 0.2;
      const padSide = cw * 0.05;
      cy = Math.max(0, cy - padTop);
      ch = ch + padTop;
      cx = Math.max(0, cx - padSide);
      cw = cw + padSide * 2;
    } else {
      const pad = Math.max(cw, ch) * 0.1;
      cx = Math.max(0, cx - pad);
      cy = Math.max(0, cy - pad);
      cw = cw + pad * 2;
      ch = ch + pad * 2;
    }

    // Clamp to frame
    cx = Math.max(0, cx);
    cy = Math.max(0, cy);
    cw = Math.min(cw, canvas.width - cx);
    ch = Math.min(ch, canvas.height - cy);

    const crop = document.createElement("canvas");
    crop.width = Math.max(1, Math.round(cw));
    crop.height = Math.max(1, Math.round(ch));
    const cctx = crop.getContext("2d");
    if (!cctx) { setAnalyzing(false); return; }
    cctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, crop.width, crop.height);

    crop.toBlob(async (blob) => {
      if (!blob) { setAnalyzing(false); return; }
      const form = new FormData();
      form.append("image", blob, "crop.jpg");

      const endpoint = det.object_class === "person"
        ? `${API_URL}/api/video/analyze-person`
        : `${API_URL}/api/video/analyze-vehicle`;

      try {
        const resp = await fetch(endpoint, { method: "POST", body: form });
        if (resp.ok) {
          setAnalysis(await resp.json());
        }
      } catch (err) {
        console.error("Analysis failed:", err);
      } finally {
        setAnalyzing(false);
      }
    }, "image/jpeg", 0.9);
  }, []);

  const boxColor = (cls: string) => {
    if (cls === "person") return "#00f0ff";
    if (cls === "vehicle") return "#00ff88";
    if (cls === "bike") return "#ffaa00";
    if (cls === "bag") return "#ff2d78";
    return "#888";
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex bg-[#030712]"
    >
      {/* Video area */}
      <div className="relative flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#00f0ff]/15 bg-[#020a18] px-4">
          <div className="flex items-center gap-3">
            <span className="font-heading text-sm uppercase tracking-[0.15em] text-[#00f0ff]">{camera.name}</span>
            <span className="rounded-sm border border-[#00f0ff]/20 bg-[#00f0ff]/5 px-2 py-0.5 font-data text-[10px] text-[#00f0ff]/70">
              {camera.zone_id ?? camera.id.slice(0, 8)}
            </span>
            {detections.length > 0 && (
              <span className="font-data text-[10px] text-[#4a6a8a]">
                {detections.length} detections
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-sm border border-[#ff2d78]/30 bg-[#ff2d78]/10 p-1.5 text-[#ff2d78] hover:bg-[#ff2d78]/20"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Video + overlays */}
        <div className="relative flex-1 bg-black cursor-pointer" onClick={onVideoClick}>
          <video
            ref={videoRef}
            src={videoUrl}
            crossOrigin="anonymous"
            autoPlay
            loop
            muted
            playsInline
            onCanPlay={onVideoReady}
            className="absolute inset-0 w-full h-full object-contain"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Detection boxes — clickable */}
          {detections.length > 0 && (
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`0 0 ${videoSize.w} ${videoSize.h}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: "none" }}
            >
              {detections.map((det, i) => {
                const selected = selectedDet?.track_id === det.track_id;
                const color = boxColor(det.object_class);
                return (
                  <g
                    key={i}
                    style={{ pointerEvents: "all", cursor: "pointer" }}
                    onClick={(e) => onDetClick(det, e)}
                  >
                    <rect
                      x={det.bbox.x} y={det.bbox.y}
                      width={det.bbox.w} height={det.bbox.h}
                      stroke={color} strokeWidth={selected ? 3 : 2}
                      fill={selected ? `${color}33` : "transparent"}
                    />
                    <text
                      x={det.bbox.x + 3} y={det.bbox.y - 5}
                      fill={color} fontSize={11}
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      {det.object_class} {(det.confidence * 100).toFixed(0)}%
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Paused banner */}
          {paused && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-sm bg-[#020a18]/90 border border-[#00f0ff]/20 px-4 py-1.5 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff]">
              PAUSED — click any box to analyze, click video to resume
            </div>
          )}

          {/* LIVE indicator */}
          {!paused && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
              <span className="inline-block size-2 animate-pulse rounded-full bg-[#ff2d78] shadow-[0_0_6px_#ff2d78]" />
              <span className="font-heading text-[10px] tracking-wider text-[#ff2d78]">LIVE</span>
            </div>
          )}

          {/* HUD stats */}
          <div className="absolute bottom-3 left-3 z-20 flex gap-2">
            <HudStat label="PERSONS" value={detections.filter(d => d.object_class === "person").length} color="#00f0ff" />
            <HudStat label="VEHICLES" value={detections.filter(d => d.object_class === "vehicle").length} color="#00ff88" />
            <HudStat label="BIKES" value={detections.filter(d => d.object_class === "bike").length} color="#ffaa00" />
          </div>

          {/* Error indicator */}
          {error && (
            <div className="absolute bottom-3 right-3 z-20 rounded-sm bg-[#ff2d78]/20 px-2 py-1 font-data text-[9px] text-[#ff2d78]">
              {error}
            </div>
          )}
        </div>

        {/* Video controls bar */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-t border-[#00f0ff]/15 bg-[#020a18] px-3" onClick={(e) => e.stopPropagation()}>
          {/* Play/Pause */}
          <button onClick={togglePause} className="rounded-sm border border-[#00f0ff]/20 bg-[#00f0ff]/5 px-2 py-1 font-heading text-[9px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/15">
            {paused ? "▶ PLAY" : "⏸ PAUSE"}
          </button>
          {/* Frame step */}
          <button onClick={() => stepFrame(-1)} className="rounded-sm border border-white/10 px-1.5 py-1 font-data text-[10px] text-[#4a6a8a] hover:text-white hover:bg-white/5">
            ◀
          </button>
          <button onClick={() => stepFrame(1)} className="rounded-sm border border-white/10 px-1.5 py-1 font-data text-[10px] text-[#4a6a8a] hover:text-white hover:bg-white/5">
            ▶
          </button>
          {/* Timeline scrub */}
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.04}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="flex-1 h-1 appearance-none bg-[#00f0ff]/20 rounded-sm cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#00f0ff]"
          />
          {/* Time display */}
          <span className="font-data text-[10px] text-[#4a6a8a] tabular-nums">
            {Math.floor(currentTime / 60)}:{(Math.floor(currentTime) % 60).toString().padStart(2, "0")}
            {" / "}
            {Math.floor(duration / 60)}:{(Math.floor(duration) % 60).toString().padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Analysis side panel */}
      <AnimatePresence>
        {(selectedDet || analysis) && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full shrink-0 border-l border-[#00f0ff]/15 bg-[#020a18] overflow-y-auto overflow-x-hidden"
          >
            <div className="w-[360px] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-xs uppercase tracking-widest text-[#00f0ff]">
                  {selectedDet?.object_class === "person" ? "PERSON ANALYSIS" : "VEHICLE ANALYSIS"}
                </h3>
                <button onClick={() => { setSelectedDet(null); setAnalysis(null); }} className="text-[#4a6a8a] hover:text-white">
                  <X className="size-3.5" />
                </button>
              </div>

              {selectedDet && (
                <div className="grid grid-cols-2 gap-2">
                  <Cell label="TYPE" value={selectedDet.object_class.toUpperCase()} color={boxColor(selectedDet.object_class)} />
                  <Cell label="CONFIDENCE" value={`${(selectedDet.confidence * 100).toFixed(1)}%`} />
                  <Cell label="POSITION" value={`${Math.round(selectedDet.bbox.x)}, ${Math.round(selectedDet.bbox.y)}`} />
                  <Cell label="SIZE" value={`${Math.round(selectedDet.bbox.w)} x ${Math.round(selectedDet.bbox.h)}`} />
                </div>
              )}

              {analyzing && (
                <div className="flex items-center gap-2 py-4">
                  <div className="size-4 animate-spin rounded-full border-2 border-[#00f0ff]/30 border-t-[#00f0ff]" />
                  <span className="font-data text-xs text-[#4a6a8a]">Running AI analysis on H200...</span>
                </div>
              )}

              {/* ---- UNIFIED DYNAMIC ANALYSIS PANEL (person + vehicle) ---- */}
              {analysis && (() => {
                const isPerson = analysis.type === "person";
                const accent = isPerson ? "#00f0ff" : "#00ff88";
                const mainImage = isPerson ? analysis.person_image_b64 : analysis.vehicle_image_b64;
                const attrs = analysis.attributes ?? {};
                const description = analysis.description ?? "";
                return (
                <div className="space-y-3">
                  <div className="h-px bg-gradient-to-r from-transparent via-[${accent}]/30 to-transparent" />

                  {/* Upscaled image */}
                  {mainImage && (
                    <div className="space-y-1">
                      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                        ENHANCED {isPerson ? "PERSON" : "VEHICLE"}
                      </span>
                      <img
                        src={`data:image/jpeg;base64,${mainImage}`}
                        alt="Enhanced"
                        className="w-full rounded-sm border object-contain max-h-64"
                        style={{ borderColor: `${accent}33`, imageRendering: "auto" }}
                      />
                    </div>
                  )}

                  {/* Face section (person only) */}
                  {isPerson && analysis.face_image_b64 && (
                    <div className="space-y-1">
                      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">FACE CROP</span>
                      <img
                        src={`data:image/jpeg;base64,${analysis.face_image_b64}`}
                        alt="Face crop"
                        className="w-full rounded-sm border border-[#00ff88]/20 object-contain max-h-32"
                      />
                    </div>
                  )}

                  {isPerson && analysis.face && (
                    <div className="space-y-2">
                      <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">FACE DETECTED</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <Cell label="QUALITY" value={`${(analysis.face.quality_score * 100).toFixed(0)}%`} />
                        <Cell label="EMBEDDING" value={analysis.face.embedding ? `${analysis.face.embedding.length}-d vector` : "N/A"} />
                      </div>
                    </div>
                  )}

                  {isPerson && !analysis.face && (
                    <p className="py-2 text-center font-data text-xs text-[#4a6a8a]">
                      No face detected
                    </p>
                  )}

                  {/* Plate section (vehicle only) */}
                  {!isPerson && analysis.plate && analysis.plate.plate_text && (
                    <div className="space-y-2">
                      <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">LICENSE PLATE</h4>
                      {analysis.plate.plate_image_b64 && (
                        <img
                          src={`data:image/jpeg;base64,${analysis.plate.plate_image_b64}`}
                          alt="Plate"
                          className="mx-auto max-w-full rounded-sm border border-[#00ff88]/20 object-contain max-h-32"
                        />
                      )}
                      <div className="rounded-sm border border-[#00ff88]/20 bg-[#00ff88]/5 p-3 text-center">
                        <span className="font-data text-2xl tracking-wider text-[#00ff88]">{analysis.plate.plate_text}</span>
                      </div>
                    </div>
                  )}

                  {/* AI DESCRIPTION */}
                  {description && (
                    <>
                      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                      <div className="space-y-1">
                        <h4 className="font-heading text-[10px] uppercase tracking-widest" style={{ color: accent }}>AI DESCRIPTION</h4>
                        <p className="font-data text-[11px] leading-relaxed text-slate-300">{description}</p>
                      </div>
                    </>
                  )}

                  {/* DYNAMIC ATTRIBUTES — rendered from whatever keys the VLM returned */}
                  {Object.keys(attrs).length > 0 && (
                    <>
                      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                      <div className="space-y-2">
                        <h4 className="font-heading text-[10px] uppercase tracking-widest" style={{ color: accent }}>ATTRIBUTES</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(attrs).map(([key, val]) => {
                            const label = key.replace(/_/g, " ").toUpperCase();
                            let display: string;
                            if (typeof val === "boolean") display = val ? "Yes" : "No";
                            else if (val == null) display = "N/A";
                            else display = String(val).replace(/_/g, " ");
                            return <Cell key={key} label={label} value={display} />;
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* SOURCE CAMERA */}
                  <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <div className="space-y-2">
                    <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#4a6a8a]">SOURCE CAMERA</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Cell label="CAMERA" value={camera.name} />
                      <Cell label="ZONE" value={camera.zone_id ?? "N/A"} />
                      <Cell label="STATUS" value={camera.status.toUpperCase()} />
                      <Cell label="LOCATION" value={`${camera.location_lat.toFixed(4)}, ${camera.location_lng.toFixed(4)}`} />
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function confidenceColor(confidence: number | null | undefined): string | undefined {
  if (confidence == null) return undefined;
  if (confidence > 0.7) return "#00ff88";
  if (confidence >= 0.4) return "#ffaa00";
  return "#ff2d78";
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-sm border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">{label}</span>
      <p className="font-data text-[11px] truncate" style={{ color: color ?? "#e0f0ff" }}>{value}</p>
    </div>
  );
}

function HudStat({ label, value, color }: { label: string; value: number; color: string }) {
  if (value === 0) return null;
  return (
    <div className="rounded-sm border border-white/10 bg-[#020a18]/80 px-2.5 py-1 backdrop-blur-sm">
      <span className="font-heading text-[7px] uppercase tracking-wider text-[#4a6a8a]">{label}</span>
      <p className="font-data text-sm" style={{ color }}>{value}</p>
    </div>
  );
}

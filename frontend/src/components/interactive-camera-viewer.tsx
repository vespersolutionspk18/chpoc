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

interface PersonAttributes {
  // dsabarinathan model
  gender: string;
  gender_confidence: number;
  age_group: string;
  hair: string;
  upper_clothing: string;
  upper_color: string;
  lower_clothing: string;
  lower_color: string;
  sleeve_length: string;
  hat: boolean;
  glasses: boolean;
  backpack: boolean;
  bag: boolean;
  clothing_style: string;
  face_covered: boolean;
  // DeepFace (from face)
  precise_age: number | null;
  emotion: string | null;
  ethnicity: string | null;
  // Upscaled image
  upscaled_image_b64: string | null;
}

interface VehicleAttributes {
  // dima806 model
  make_model: string;
  make_model_confidence: number;
  // Intel model
  color: string;
  color_confidence: number;
  vehicle_type: string;
  vehicle_type_confidence: number;
  // CLIP fallback
  direction: string;
  condition: string;
  damage_visible: boolean;
  vehicle_class: string;
  // Upscaled image
  upscaled_image_b64: string | null;
}

interface AnalysisResult {
  type: string;
  person_image_b64?: string;  // 8x upscaled image
  face?: {
    face_bbox: { x: number; y: number; w: number; h: number };
    quality_score: number;
    embedding: number[] | null;
  } | null;
  face_image_b64?: string | null;
  vehicle_image_b64?: string;  // 8x upscaled image
  plate?: {
    plate_text: string;
    confidence: number;
    plate_bbox: { x: number; y: number; w: number; h: number };
    plate_image_b64?: string | null;
  } | null;
  attributes: PersonAttributes | VehicleAttributes | Record<string, unknown>;
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

  const videoUrl = `${API_URL}/api/video/file/${camera.id}`;

  // Capture current frame as blob
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
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.75);
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
        // Wait 1 second between detection requests (actual detection takes ~3s)
        await new Promise(r => setTimeout(r, 1000));
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
      setVideoReady(true);
    }
  }, []);

  // Click on video → toggle pause
  const onVideoClick = useCallback(() => {
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
      // Run detection on paused frame
      runDetection();
    }
  }, [runDetection]);

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

              {analysis && analysis.type === "person" && (() => {
                const attrs = analysis.attributes as PersonAttributes;
                const mainImage = analysis.person_image_b64
                  || (analysis.attributes as Record<string, string>).upscaled_image_b64
                  || null;
                return (
                <div className="space-y-3">
                  <div className="h-px bg-gradient-to-r from-[#00f0ff]/30 to-transparent" />

                  {/* 8x Upscaled person image -- prominent */}
                  {mainImage && (
                    <div className="space-y-1">
                      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">8X UPSCALED PERSON</span>
                      <img
                        src={`data:image/jpeg;base64,${mainImage}`}
                        alt="Person 8x upscaled"
                        className="w-full rounded-sm border border-[#00f0ff]/20 object-contain max-h-64"
                        style={{ imageRendering: "auto" }}
                      />
                    </div>
                  )}

                  {/* Face crop */}
                  {analysis.face_image_b64 && (
                    <div className="space-y-1">
                      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">FACE CROP</span>
                      <img
                        src={`data:image/jpeg;base64,${analysis.face_image_b64}`}
                        alt="Face crop"
                        className="w-full rounded-sm border border-[#00ff88]/20 object-contain max-h-32"
                      />
                    </div>
                  )}

                  {/* Face info */}
                  {analysis.face && (
                    <div className="space-y-2">
                      <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">FACE DETECTED</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <Cell label="QUALITY" value={`${(analysis.face.quality_score * 100).toFixed(0)}%`} />
                        <Cell label="EMBEDDING" value={analysis.face.embedding ? `${analysis.face.embedding.length}-d vector` : "N/A"} />
                      </div>
                      {analysis.face.embedding && (
                        <p className="font-data text-[9px] text-[#4a6a8a]">
                          512-d face embedding captured -- searchable across all cameras
                        </p>
                      )}
                    </div>
                  )}

                  {!analysis.face && (
                    <p className="py-2 text-center font-data text-xs text-[#4a6a8a]">
                      No face detected -- person may be facing away or occluded
                    </p>
                  )}

                  {/* IDENTITY section */}
                  {analysis.attributes && Object.keys(analysis.attributes).length > 0 && (
                    <>
                      <div className="h-px bg-gradient-to-r from-[#00f0ff]/20 to-transparent" />
                      <div className="space-y-2">
                        <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00f0ff]">IDENTITY</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Cell
                            label="GENDER"
                            value={`${attrs.gender ?? "N/A"} (${attrs.gender_confidence != null ? (attrs.gender_confidence * 100).toFixed(0) : "?"}%)`}
                            color={confidenceColor(attrs.gender_confidence)}
                          />
                          <Cell label="AGE GROUP" value={attrs.age_group?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="PRECISE AGE" value={attrs.precise_age != null ? `~${attrs.precise_age} years` : "N/A"} />
                          <Cell label="ETHNICITY" value={attrs.ethnicity?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="EMOTION" value={attrs.emotion?.replace(/_/g, " ") ?? "N/A"} />
                        </div>
                      </div>

                      {/* APPEARANCE section */}
                      <div className="h-px bg-gradient-to-r from-[#00f0ff]/20 to-transparent" />
                      <div className="space-y-2">
                        <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00f0ff]">APPEARANCE</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Cell label="HAIR" value={attrs.hair?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="GLASSES" value={attrs.glasses != null ? (attrs.glasses ? "Yes" : "No") : "N/A"} />
                          <Cell label="HAT" value={attrs.hat != null ? (attrs.hat ? "Yes" : "No") : "N/A"} />
                          <Cell label="FACE COVERED" value={attrs.face_covered != null ? (attrs.face_covered ? "Yes" : "No") : "N/A"} color={attrs.face_covered ? "#ff2d78" : "#00ff88"} />
                        </div>
                      </div>

                      {/* CLOTHING section */}
                      <div className="h-px bg-gradient-to-r from-[#00f0ff]/20 to-transparent" />
                      <div className="space-y-2">
                        <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00f0ff]">CLOTHING</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Cell label="UPPER CLOTHING" value={attrs.upper_clothing?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="UPPER COLOR" value={attrs.upper_color?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="SLEEVE LENGTH" value={attrs.sleeve_length?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="LOWER CLOTHING" value={attrs.lower_clothing?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="LOWER COLOR" value={attrs.lower_color?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="CLOTHING STYLE" value={attrs.clothing_style?.replace(/_/g, " ") ?? "N/A"} />
                        </div>
                      </div>

                      {/* CARRYING section */}
                      <div className="h-px bg-gradient-to-r from-[#00f0ff]/20 to-transparent" />
                      <div className="space-y-2">
                        <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00f0ff]">CARRYING</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Cell label="BAG" value={attrs.bag != null ? (attrs.bag ? "Yes" : "No") : "N/A"} />
                          <Cell label="BACKPACK" value={attrs.backpack != null ? (attrs.backpack ? "Yes" : "No") : "N/A"} />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="h-px bg-gradient-to-r from-[#00f0ff]/20 to-transparent" />
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

              {analysis && analysis.type === "vehicle" && (() => {
                const attrs = analysis.attributes as VehicleAttributes;
                const mainImage = analysis.vehicle_image_b64
                  || (analysis.attributes as Record<string, string>).upscaled_image_b64
                  || null;
                return (
                <div className="space-y-3">
                  <div className="h-px bg-gradient-to-r from-[#00ff88]/30 to-transparent" />

                  {/* 8x Upscaled vehicle image -- prominent */}
                  {mainImage && (
                    <div className="space-y-1">
                      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">8X UPSCALED VEHICLE</span>
                      <img
                        src={`data:image/jpeg;base64,${mainImage}`}
                        alt="Vehicle 8x upscaled"
                        className="w-full rounded-sm border border-[#00ff88]/20 object-contain max-h-64"
                        style={{ imageRendering: "auto" }}
                      />
                    </div>
                  )}

                  {/* Plate section */}
                  {analysis.plate && analysis.plate.plate_text && (
                    <div className="space-y-2">
                      <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">LICENSE PLATE</h4>
                      {analysis.plate.plate_image_b64 && (
                        <div className="space-y-1">
                          <img
                            src={`data:image/jpeg;base64,${analysis.plate.plate_image_b64}`}
                            alt="Plate crop"
                            className="mx-auto max-w-full rounded-sm border border-[#00ff88]/20 object-contain max-h-32"
                          />
                        </div>
                      )}
                      <div className="rounded-sm border border-[#00ff88]/20 bg-[#00ff88]/5 p-3 text-center">
                        <span className="font-data text-2xl tracking-wider text-[#00ff88]">{analysis.plate.plate_text}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Cell label="OCR CONFIDENCE" value={`${(analysis.plate.confidence * 100).toFixed(0)}%`} />
                        <Cell label="PLATE POS" value={`${Math.round(analysis.plate.plate_bbox.x)}, ${Math.round(analysis.plate.plate_bbox.y)}`} />
                      </div>
                    </div>
                  )}

                  {(!analysis.plate || !analysis.plate.plate_text) && (
                    <p className="py-2 text-center font-data text-xs text-[#4a6a8a]">
                      No license plate detected in this crop
                    </p>
                  )}

                  {/* IDENTIFICATION section */}
                  {analysis.attributes && Object.keys(analysis.attributes).length > 0 && (
                    <>
                      <div className="h-px bg-gradient-to-r from-[#00ff88]/20 to-transparent" />
                      <div className="space-y-2">
                        <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">IDENTIFICATION</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Cell
                            label="MAKE / MODEL"
                            value={attrs.make_model?.replace(/_/g, " ") ?? "N/A"}
                            color={confidenceColor(attrs.make_model_confidence)}
                          />
                          <Cell
                            label="MAKE CONFIDENCE"
                            value={attrs.make_model_confidence != null ? `${(attrs.make_model_confidence * 100).toFixed(0)}%` : "N/A"}
                            color={confidenceColor(attrs.make_model_confidence)}
                          />
                          <Cell
                            label="COLOR"
                            value={attrs.color ?? "N/A"}
                            color={confidenceColor(attrs.color_confidence)}
                          />
                          <Cell
                            label="COLOR CONFIDENCE"
                            value={attrs.color_confidence != null ? `${(attrs.color_confidence * 100).toFixed(0)}%` : "N/A"}
                            color={confidenceColor(attrs.color_confidence)}
                          />
                          <Cell
                            label="VEHICLE TYPE"
                            value={attrs.vehicle_type?.replace(/_/g, " ") ?? "N/A"}
                            color={confidenceColor(attrs.vehicle_type_confidence)}
                          />
                          <Cell
                            label="TYPE CONFIDENCE"
                            value={attrs.vehicle_type_confidence != null ? `${(attrs.vehicle_type_confidence * 100).toFixed(0)}%` : "N/A"}
                            color={confidenceColor(attrs.vehicle_type_confidence)}
                          />
                        </div>
                      </div>

                      {/* STATUS section */}
                      <div className="h-px bg-gradient-to-r from-[#00ff88]/20 to-transparent" />
                      <div className="space-y-2">
                        <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">STATUS</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Cell label="DIRECTION" value={attrs.direction?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="CONDITION" value={attrs.condition?.replace(/_/g, " ") ?? "N/A"} />
                          <Cell label="DAMAGE VISIBLE" value={attrs.damage_visible != null ? (attrs.damage_visible ? "Yes" : "No") : "N/A"} color={attrs.damage_visible ? "#ff2d78" : "#00ff88"} />
                          <Cell label="VEHICLE CLASS" value={attrs.vehicle_class?.replace(/_/g, " ") ?? "N/A"} />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="h-px bg-gradient-to-r from-[#00ff88]/20 to-transparent" />
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

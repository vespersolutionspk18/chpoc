"use client";

import { useState, useRef, useEffect, useCallback, type RefObject } from "react";
import { X } from "lucide-react";

interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RegionAnalysis {
  description?: string;
  attributes?: Record<string, unknown>;
  error?: string;
}

interface SelectionToolProps {
  /** The image or video element to crop from */
  sourceRef: RefObject<HTMLImageElement | HTMLVideoElement | null>;
  /** Base API URL (e.g. http://localhost:8000) */
  apiUrl: string;
  /** Callback fired with the VLM analysis result */
  onAnalysis?: (result: RegionAnalysis) => void;
  /** Whether drawing mode is active */
  enabled: boolean;
}

/**
 * SelectionTool — transparent canvas overlay for drawing a rectangle
 * selection on an image or paused video frame. The selected region is
 * cropped and sent to the backend for Qwen2.5-VL analysis.
 *
 * Place this component as a sibling (or child) inside the same
 * `position: relative` container that holds the source element.
 */
export function SelectionTool({
  sourceRef,
  apiUrl,
  onAnalysis,
  enabled,
}: SelectionToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<SelectionRect | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<RegionAnalysis | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Get pointer position relative to the canvas, accounting for CSS scaling. */
  const getPointerPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      let clientX: number;
      let clientY: number;
      if ("touches" in e) {
        const touch = e.touches[0] ?? (e as TouchEvent).changedTouches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },
    [],
  );

  /** Build a normalized rect (positive width/height) from two points. */
  const buildRect = useCallback(
    (p1: { x: number; y: number }, p2: { x: number; y: number }): SelectionRect => {
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      return {
        x,
        y,
        w: Math.abs(p2.x - p1.x),
        h: Math.abs(p2.y - p1.y),
      };
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Draw the selection rectangle on every frame
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas pixel size to its CSS layout size
    const { width, height } = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(width) || canvas.height !== Math.round(height)) {
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentRect && currentRect.w > 2 && currentRect.h > 2) {
      // Semi-transparent overlay outside the selection
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);

      // Dashed cyan border
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);

      // Corner markers
      ctx.setLineDash([]);
      const cornerLen = Math.min(12, currentRect.w / 3, currentRect.h / 3);
      const corners = [
        { x: currentRect.x, y: currentRect.y }, // top-left
        { x: currentRect.x + currentRect.w, y: currentRect.y }, // top-right
        { x: currentRect.x, y: currentRect.y + currentRect.h }, // bottom-left
        { x: currentRect.x + currentRect.w, y: currentRect.y + currentRect.h }, // bottom-right
      ];
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 2.5;
      for (const c of corners) {
        const dirX = c.x === currentRect.x ? 1 : -1;
        const dirY = c.y === currentRect.y ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(c.x + dirX * cornerLen, c.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(c.x, c.y + dirY * cornerLen);
        ctx.stroke();
      }

      // Dimension label
      if (!drawing) {
        const label = `${Math.round(currentRect.w)} x ${Math.round(currentRect.h)}`;
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.fillStyle = "#00f0ff";
        ctx.textAlign = "center";
        ctx.fillText(label, currentRect.x + currentRect.w / 2, currentRect.y - 6);
      }
    }
  }, [currentRect, drawing]);

  // ---------------------------------------------------------------------------
  // Pointer handlers
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!enabled || analyzing) return;
      e.preventDefault();
      const pos = getPointerPos(e);
      setStartPoint(pos);
      setDrawing(true);
      setCurrentRect(null);
      setResult(null);
    },
    [enabled, analyzing, getPointerPos],
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawing || !startPoint) return;
      e.preventDefault();
      const pos = getPointerPos(e);
      setCurrentRect(buildRect(startPoint, pos));
    },
    [drawing, startPoint, getPointerPos, buildRect],
  );

  const handlePointerUp = useCallback(
    async (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawing || !startPoint) return;
      e.preventDefault();
      const pos = getPointerPos(e);
      const rect = buildRect(startPoint, pos);
      setDrawing(false);
      setStartPoint(null);

      // Ignore tiny accidental clicks
      if (rect.w < 10 || rect.h < 10) {
        setCurrentRect(null);
        return;
      }

      setCurrentRect(rect);
      setPanelPos({
        x: Math.min(rect.x + rect.w + 12, (canvasRef.current?.getBoundingClientRect().width ?? 400) - 280),
        y: Math.max(8, rect.y),
      });

      // -----------------------------------------------------------------------
      // Crop from source and send to backend
      // -----------------------------------------------------------------------
      const source = sourceRef.current;
      const canvas = canvasRef.current;
      if (!source || !canvas) return;

      setAnalyzing(true);
      setResult(null);

      try {
        // Determine the natural (intrinsic) dimensions of the source
        let naturalW: number;
        let naturalH: number;
        if (source instanceof HTMLVideoElement) {
          naturalW = source.videoWidth;
          naturalH = source.videoHeight;
        } else {
          naturalW = source.naturalWidth;
          naturalH = source.naturalHeight;
        }

        // The canvas overlay matches the CSS size of the container, but the
        // source may have a different intrinsic resolution. Compute the scale
        // from overlay coordinates to source pixels.
        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = naturalW / canvasRect.width;
        const scaleY = naturalH / canvasRect.height;

        const srcX = Math.max(0, Math.round(rect.x * scaleX));
        const srcY = Math.max(0, Math.round(rect.y * scaleY));
        const srcW = Math.min(Math.round(rect.w * scaleX), naturalW - srcX);
        const srcH = Math.min(Math.round(rect.h * scaleY), naturalH - srcY);

        // Draw full source into a temporary canvas, then crop
        const tmp = document.createElement("canvas");
        tmp.width = srcW;
        tmp.height = srcH;
        const tctx = tmp.getContext("2d");
        if (!tctx) { setAnalyzing(false); return; }
        try {
          tctx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
        } catch (drawErr) {
          // CORS tainted canvas — try drawing without cross-origin
          const errResult: RegionAnalysis = { error: `Canvas capture failed (CORS): ${drawErr}. Try pausing the video first.` };
          setResult(errResult);
          onAnalysis?.(errResult);
          setAnalyzing(false);
          return;
        }

        let blob: Blob | null = null;
        try {
          blob = await new Promise<Blob | null>((resolve) =>
            tmp.toBlob((b) => resolve(b), "image/jpeg", 0.92),
          );
        } catch (blobErr) {
          const errResult: RegionAnalysis = { error: `Image export failed (CORS): ${blobErr}` };
          setResult(errResult);
          onAnalysis?.(errResult);
          setAnalyzing(false);
          return;
        }
        if (!blob) { setAnalyzing(false); return; }

        const form = new FormData();
        form.append("image", blob, "region.jpg");

        const resp = await fetch(`${apiUrl}/api/video/analyze-region`, {
          method: "POST",
          body: form,
        });

        if (resp.ok) {
          const data: RegionAnalysis = await resp.json();
          setResult(data);
          onAnalysis?.(data);
        } else {
          const err: RegionAnalysis = { error: `Server returned ${resp.status}` };
          setResult(err);
          onAnalysis?.(err);
        }
      } catch (err) {
        const errResult: RegionAnalysis = { error: String(err) };
        setResult(errResult);
        onAnalysis?.(errResult);
      } finally {
        setAnalyzing(false);
      }
    },
    [drawing, startPoint, getPointerPos, buildRect, sourceRef, apiUrl, onAnalysis, analyzing],
  );

  // ---------------------------------------------------------------------------
  // Clear selection
  // ---------------------------------------------------------------------------
  const clearSelection = useCallback(() => {
    setCurrentRect(null);
    setResult(null);
    setAnalyzing(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!enabled) return null;

  return (
    <>
      {/* Drawing canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-40 h-full w-full"
        style={{ cursor: drawing ? "crosshair" : analyzing ? "wait" : "crosshair" }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={(e) => { if (drawing) handlePointerUp(e); }}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />

      {/* Instruction badge */}
      {!currentRect && !analyzing && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-sm border border-[#00f0ff]/25 bg-[#020a18]/90 px-4 py-1.5 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] backdrop-blur-sm">
          DRAW A RECTANGLE TO ANALYZE A REGION
        </div>
      )}

      {/* Loading indicator */}
      {analyzing && (
        <div
          className="absolute z-50 flex items-center gap-2 rounded-sm border border-[#00f0ff]/30 bg-[#020a18]/95 px-3 py-2 backdrop-blur-sm"
          style={{ left: panelPos.x, top: panelPos.y }}
        >
          <div className="size-4 animate-spin rounded-full border-2 border-[#00f0ff]/30 border-t-[#00f0ff]" />
          <span className="font-data text-[10px] text-[#4a6a8a]">Analyzing region...</span>
        </div>
      )}

      {/* Result panel */}
      {result && !analyzing && currentRect && (
        <div
          className="absolute z-50 w-[270px] max-h-[60vh] overflow-y-auto rounded-sm border border-[#00f0ff]/20 bg-[#020a18]/95 shadow-[0_0_30px_rgba(0,240,255,0.08)] backdrop-blur-sm"
          style={{ left: panelPos.x, top: panelPos.y }}
        >
          <div className="p-3 space-y-2.5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h4 className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#00f0ff]">
                REGION ANALYSIS
              </h4>
              <button
                onClick={clearSelection}
                className="rounded-sm p-0.5 text-[#4a6a8a] hover:text-white transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>

            {result.error ? (
              <p className="font-data text-[10px] text-[#ff2d78]">{result.error}</p>
            ) : (
              <>
                {/* Description */}
                {result.description && (
                  <div className="space-y-1">
                    <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                      DESCRIPTION
                    </span>
                    <p className="font-data text-[11px] leading-relaxed text-slate-300">
                      {result.description}
                    </p>
                  </div>
                )}

                {/* Attributes table */}
                {result.attributes && Object.keys(result.attributes).length > 0 && (
                  <>
                    <div className="h-px bg-gradient-to-r from-transparent via-[#00f0ff]/20 to-transparent" />
                    <div className="space-y-1.5">
                      <span className="font-heading text-[7px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                        ATTRIBUTES
                      </span>
                      <table className="w-full border-collapse">
                        <tbody>
                          {Object.entries(result.attributes).map(([key, val]) => {
                            let display: string;
                            if (typeof val === "boolean") display = val ? "Yes" : "No";
                            else if (val == null) display = "N/A";
                            else if (typeof val === "object") display = JSON.stringify(val);
                            else display = String(val).replace(/_/g, " ");
                            return (
                              <tr key={key} className="border-b border-white/5">
                                <td className="w-[100px] min-w-[100px] py-1 pr-2 align-top font-heading text-[7px] uppercase tracking-[0.15em] text-[#4a6a8a] whitespace-nowrap">
                                  {key.replace(/_/g, " ").toUpperCase()}
                                </td>
                                <td className="py-1 font-data text-[10px] text-[#e0f0ff] break-words">
                                  {display}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

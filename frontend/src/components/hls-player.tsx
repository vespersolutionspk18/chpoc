"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface Props {
  src: string;
  className?: string;
  muted?: boolean;
  autoPlay?: boolean;
  crossOrigin?: "" | "anonymous" | "use-credentials";
  onReady?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

export function HlsPlayer({ src, className, muted = true, autoPlay = true, crossOrigin, onReady, videoRef: externalRef }: Props) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const ref = externalRef ?? internalRef;
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 10,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) video.play().catch(() => {});
        onReady?.();
      });
      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = src;
      video.addEventListener("canplay", () => {
        if (autoPlay) video.play().catch(() => {});
        onReady?.();
      });
    }
  }, [src, autoPlay, onReady, ref]);

  return (
    <video
      ref={ref}
      className={className}
      muted={muted}
      playsInline
      crossOrigin={crossOrigin ?? "anonymous"}
    />
  );
}

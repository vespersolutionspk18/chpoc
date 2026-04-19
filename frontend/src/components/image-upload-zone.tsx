"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface ImageUploadZoneProps {
  onFileSelect: (file: File) => void;
  preview: string | null;
}

export function ImageUploadZone({
  onFileSelect,
  preview,
}: ImageUploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxFiles: 1,
    multiple: false,
  });

  return (
    <div className="hud-card rounded-sm p-4">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed px-6 py-10",
          "cursor-pointer transition-all",
          isDragActive
            ? "border-[#00f0ff] bg-[#00f0ff]/5 shadow-[0_0_24px_#00f0ff20] glow-cyan"
            : "border-[#00f0ff]/25 hover:border-[#00f0ff]/50"
        )}
      >
        <input {...getInputProps()} />

        {preview ? (
          <div className="relative flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Uploaded target preview"
              className="h-28 w-28 rounded-sm border border-[#00f0ff]/20 object-cover"
            />
            {/* Scanline overlay on preview */}
            <div className="scan-line pointer-events-none absolute inset-0 rounded-sm opacity-40" />
            <span className="font-body text-xs text-[#4a6a8a]">
              Click or drop to replace
            </span>
          </div>
        ) : (
          <>
            <div className="flex size-12 items-center justify-center">
              {isDragActive ? (
                <ImageIcon className="size-8 text-[#00f0ff]" />
              ) : (
                <Upload className="size-8 text-[#00f0ff]/30" />
              )}
            </div>
            <div className="text-center">
              <p className="font-heading text-xs uppercase tracking-wider text-[#00f0ff]/60">
                DROP TARGET IMAGE
              </p>
              <p className="mt-1 font-body text-xs text-[#4a6a8a]">
                or click to browse
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

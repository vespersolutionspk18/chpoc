"use client";

import { cn } from "@/lib/utils";

function SkeletonPulse({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-sm bg-[#00f0ff]/[0.04]",
        className
      )}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stat cards row -- 4 hud-card shaped skeletons */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="hud-card rounded-sm border border-[#00f0ff]/8 bg-[#030712]/80 p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <SkeletonPulse className="h-3 w-20" />
                <SkeletonPulse className="h-7 w-16" />
              </div>
              <SkeletonPulse className="size-5 rounded-sm" />
            </div>
            <SkeletonPulse className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Large content skeleton */}
      <div className="hud-card rounded-sm border border-[#00f0ff]/8 bg-[#030712]/80 p-1">
        <SkeletonPulse className="h-[400px] w-full" />
      </div>
    </div>
  );
}

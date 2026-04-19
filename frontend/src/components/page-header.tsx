"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div
      className="flex items-start justify-between gap-4 pb-4 mb-6"
      style={{
        borderBottom: "1px solid transparent",
        borderImage: "linear-gradient(90deg, rgba(0, 240, 255, 0.3), transparent) 1",
      }}
    >
      <div className="space-y-1.5">
        {/* HUD accent line */}
        <div className="flex items-center gap-3">
          <div
            className="h-[2px] w-10 shrink-0"
            style={{ backgroundColor: "#00f0ff" }}
          />
          <h1 className="font-heading text-lg tracking-[0.15em] text-[#e0f0ff] text-glow">
            {title}
          </h1>
        </div>
        {description && (
          <p className="font-body text-sm text-[#4a6a8a] pl-[52px]">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}

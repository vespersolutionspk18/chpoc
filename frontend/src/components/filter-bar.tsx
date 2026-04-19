"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

interface FilterBarProps {
  children: ReactNode;
  onClear: () => void;
}

export function FilterBar({ children, onClear }: FilterBarProps) {
  return (
    <div className="glass-deep flex flex-wrap items-center gap-3 rounded-sm border border-[#00f0ff]/10 px-4 py-2.5">
      {children}
      <button
        onClick={onClear}
        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm border border-[#00f0ff]/20 bg-transparent px-2 py-1 font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a] transition-colors hover:border-[#00f0ff]/40 hover:text-[#00f0ff]"
      >
        <X className="size-2.5" />
        CLEAR
      </button>
    </div>
  );
}

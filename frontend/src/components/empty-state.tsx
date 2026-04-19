"use client";

import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="size-14 text-[#00f0ff] opacity-20" />
      <h3 className="mt-4 font-heading text-sm uppercase tracking-wider text-[#00f0ff]/60">
        {title}
      </h3>
      <p className="mt-2 max-w-sm font-body text-xs text-[#4a6a8a]">
        {description}
      </p>
    </div>
  );
}

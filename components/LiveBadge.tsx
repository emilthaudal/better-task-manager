"use client";

import { useSecondsTick } from "@/hooks/useSecondsTick";

interface LiveBadgeProps {
  lastUpdated: Date | null;
}

/**
 * Animated "live" badge showing how long ago the last successful fetch was.
 * Ticks every second while `lastUpdated` is set.
 */
export default function LiveBadge({ lastUpdated }: LiveBadgeProps) {
  const seconds = useSecondsTick(lastUpdated !== null);

  const label =
    seconds < 5
      ? "just now"
      : seconds < 60
      ? `${seconds}s ago`
      : `${Math.floor(seconds / 60)}m ago`;

  return (
    <span className="ml-auto flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-[11px] font-medium px-2.5 py-1 rounded-full">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      {label}
    </span>
  );
}

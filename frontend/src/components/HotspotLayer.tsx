"use client";

import type { Hotspot } from "@/lib/types";

type Props = {
  hotspots: Hotspot[];
  activeId?: string | null;
  onSelect: (hotspot: Hotspot) => void;
};

export function HotspotLayer({ hotspots, activeId, onSelect }: Props) {
  if (!hotspots.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {hotspots.map((hs) => {
        const active = hs.id === activeId;
        return (
          <button
            key={hs.id}
            type="button"
            onClick={() => onSelect(hs)}
            className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm transition ${
              active
                ? "bg-[var(--accent)] text-white ring-2 ring-[var(--accent)]/40"
                : "bg-white/95 text-[var(--accent)] ring-1 ring-black/10 hover:bg-[var(--accent-soft)]"
            }`}
            style={{ left: `${hs.x}%`, top: `${hs.y}%` }}
          >
            {hs.label}
          </button>
        );
      })}
    </div>
  );
}

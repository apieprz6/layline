"use client";

import type { TimeScale } from "@/lib/utils/windowing";

interface ScaleControlProps {
  activeScale: TimeScale;
  onScaleChange: (scale: TimeScale) => void;
}

const SCALES: TimeScale[] = ["30m", "1h", "6h", "24h", "72h"];

export default function ScaleControl({
  activeScale,
  onScaleChange,
}: ScaleControlProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        background: "var(--surface-elevated)",
        border: "1px solid var(--surface-border)",
        borderRadius: "10px",
        padding: "3px",
        gap: "2px",
      }}
    >
      {SCALES.map((scale) => (
        <button
          key={scale}
          onClick={() => onScaleChange(scale)}
          className={scale === activeScale ? "active" : ""}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "12px",
            fontWeight: "500",
            letterSpacing: "0.04em",
            color:
              scale === activeScale
                ? "var(--text-primary)"
                : "var(--text-muted)",
            background:
              scale === activeScale ? "var(--surface-raised)" : "transparent",
            border: "none",
            borderRadius: "7px",
            padding: "7px 0",
            cursor: "pointer",
            transition: "all 150ms ease-out",
            WebkitTapHighlightColor: "transparent",
            boxShadow:
              scale === activeScale ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
          }}
        >
          {scale}
        </button>
      ))}
    </div>
  );
}

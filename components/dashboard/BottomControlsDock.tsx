"use client";

import type { TimeScale } from "@/lib/utils/windowing";
import ScaleControl from "./ScaleControl";
import TimeScrubber from "./TimeScrubber";
import { formatDateTimeRange } from "@/lib/utils/time";

interface BottomControlsDockProps {
  scaleId: TimeScale;
  nowOffset: number;
  maxOffset: number;
  timeWindowMinutes: number;
  isLive: boolean;
  referenceTime: Date;
  windowStart: Date;
  onScaleChange: (scale: TimeScale) => void;
  onOffsetChange: (offset: number) => void;
  onReturnToLive: () => void;
}

export default function BottomControlsDock({
  scaleId,
  nowOffset,
  maxOffset,
  timeWindowMinutes,
  isLive,
  referenceTime,
  windowStart,
  onScaleChange,
  onOffsetChange,
  onReturnToLive,
}: BottomControlsDockProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        background: "var(--surface-dock-bg)",
        backdropFilter: "var(--surface-dock-blur)",
        WebkitBackdropFilter: "var(--surface-dock-blur)",
        borderTop: "1px solid var(--surface-divider)",
        padding: "12px 16px",
        paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 12px)",
        boxShadow: "var(--shadow-dock)",
      }}
    >
      {/* Scale selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "9.5px",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          Scale
        </span>
        <div style={{ flex: 1 }}>
          <ScaleControl activeScale={scaleId} onScaleChange={onScaleChange} />
        </div>
      </div>

      {/* Scrubber row with label and button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "9.5px",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Time scrubber
        </span>
        <button
          onClick={onReturnToLive}
          disabled={isLive}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "11px",
            fontWeight: 500,
            padding: "5px 9px",
            background: "var(--accent-primary)",
            color: "white",
            border: "1px solid var(--accent-primary)",
            borderRadius: "8px",
            cursor: isLive ? "not-allowed" : "pointer",
            opacity: isLive ? 0.45 : 1,
          }}
        >
          Live →
        </button>
      </div>

      {/* Time scrubber */}
      <TimeScrubber
        value={nowOffset}
        max={maxOffset}
        scaleMinutes={timeWindowMinutes}
        onChange={onOffsetChange}
      />

      {/* Date/time range display */}
      <div
        style={{
          marginTop: "2px",
          fontSize: "10px",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          textAlign: "center",
        }}
      >
        {formatDateTimeRange(windowStart)} →{" "}
        {formatDateTimeRange(referenceTime)}
      </div>
    </div>
  );
}

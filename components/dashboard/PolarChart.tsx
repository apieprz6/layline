"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { WindDataPoint, WindDataPointWithOffset } from "@/types";
import {
  getWindColorHex,
  getWindCondition,
  getCompassDirection,
} from "@/lib/utils/wind";
import { TIME_SCALES } from "@/lib/utils/windowing";
import { formatTimeOffset, formatTime, getMinutesAgo } from "@/lib/utils/time";
import { findPointByRadius } from "@/lib/utils/radialSelection";

interface PolarChartProps {
  data: WindDataPoint[];
  timeWindowMinutes: number;
  nowOffsetMinutes?: number; // Minutes ago from current time (0 = live, 60 = 1h ago)
  referenceTime?: Date;
  hoverPoint?: WindDataPointWithOffset | null;
  onHoverChange?: (point: WindDataPointWithOffset | null) => void;
  displayPoint?: WindDataPointWithOffset; // NEW: Data point to display in overlays
  mode?: "reference" | "touch"; // NEW: Display mode for header label
}

const SIZE = 360;
const PAD = 42;
const CENTER_X = SIZE / 2;
const CENTER_Y = SIZE / 2;
const R = (SIZE - PAD * 2) / 2;
const LABEL_RADIUS = R * 1.13;

// Compass directions with angles (0° = North = top)
const COMPASS_LABELS = [
  { label: "N", angle: 0 },
  { label: "NE", angle: 45 },
  { label: "E", angle: 90 },
  { label: "SE", angle: 135 },
  { label: "S", angle: 180 },
  { label: "SW", angle: 225 },
  { label: "W", angle: 270 },
  { label: "NW", angle: 315 },
];

function polarToXY(
  angleDeg: number,
  r0to1: number,
  cx: number,
  cy: number,
  radius: number,
): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const x = Math.round((cx + r0to1 * radius * Math.cos(rad)) * 1e6) / 1e6;
  const y = Math.round((cy + r0to1 * radius * Math.sin(rad)) * 1e6) / 1e6;
  return [x, y];
}

// Note: Replaced by findPointByRadius from radialSelection module
// Old cartesian-distance based selection removed in favor of time-prioritized radial selection

export default function PolarChart({
  data,
  timeWindowMinutes,
  nowOffsetMinutes = 0,
  referenceTime,
  hoverPoint,
  onHoverChange,
  displayPoint,
  mode = "reference",
}: PolarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });

  // Transform WindDataPoint[] to WindDataPointWithOffset[] by calculating minsAgo
  const dataWithOffset: WindDataPointWithOffset[] = useMemo(() => {
    const now = referenceTime || new Date();
    return data.map((point) => ({
      ...point,
      minsAgo: getMinutesAgo(point.timestamp, now),
    }));
  }, [data, referenceTime]);

  // Measure SVG dimensions for overlay positioning
  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setSvgDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Get time scale configuration
  const timeScale = useMemo(() => {
    const scaleEntry = Object.entries(TIME_SCALES).find(
      ([, config]) => config.minutes === timeWindowMinutes,
    );
    return scaleEntry ? scaleEntry[1] : null;
  }, [timeWindowMinutes]);

  // Calculate radial ring positions from ticks
  const radialRings = useMemo(() => {
    if (!timeScale) return [];

    return timeScale.ticks.map((tickMinutes, index) => ({
      minutes: tickMinutes,
      absMinutes: nowOffsetMinutes + tickMinutes, // Absolute time from "now"
      r01: 1 - tickMinutes / timeWindowMinutes,
      isOuterRing: index === 0,
    }));
  }, [timeScale, timeWindowMinutes, nowOffsetMinutes]);

  // Filter which rings get time labels (to avoid clutter)
  const labeledRings = useMemo(() => {
    const n = radialRings.length;
    if (n === 0) return [];

    return radialRings.filter((_ring, i) => {
      // Always show outer (i === 0) and inner (i === n-1)
      if (i === 0 || i === n - 1) return true;

      // Show midpoint
      if (i === Math.floor(n / 2)) return true;

      // For 5+ rings, show quarter points
      if (
        n >= 5 &&
        (i === Math.floor(n / 4) || i === Math.floor((3 * n) / 4))
      ) {
        return true;
      }

      return false;
    });
  }, [radialRings]);

  // Filter and map data points to polar coordinates relative to time window
  const dataPoints = useMemo(() => {
    if (timeWindowMinutes === 0) return [];

    // Define the time window based on nowOffsetMinutes
    // nowOffset = 0 (live): show minsAgo [0, timeWindowMinutes]
    // nowOffset = 60 (1h ago): show minsAgo [60, 60 + timeWindowMinutes]
    const windowStart = nowOffsetMinutes;
    const windowEnd = nowOffsetMinutes + timeWindowMinutes;

    return dataWithOffset
      .filter(
        (point) => point.minsAgo >= windowStart && point.minsAgo <= windowEnd,
      )
      .map((point) => {
        // r01: 1 = reference time (outer ring), 0 = oldest time in window (center)
        // Relative position within the current window
        const relativeAge = point.minsAgo - windowStart;
        const r01 = 1 - relativeAge / timeWindowMinutes;
        const [x, y] = polarToXY(point.dir, r01, CENTER_X, CENTER_Y, R);
        const color = getWindColorHex(point.spd);
        const opacity =
          Math.round((0.15 + 0.85 * Math.pow(r01, 1.2)) * 1e6) / 1e6;

        return { ...point, x, y, r01, color, opacity };
      })
      .sort((a, b) => a.minsAgo - b.minsAgo); // Sort oldest to newest
  }, [dataWithOffset, timeWindowMinutes, nowOffsetMinutes]);

  // Generate line segments, skipping gaps > 90°
  const lineSegments = useMemo(() => {
    const segments: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      opacity: number;
    }> = [];

    for (let i = 0; i < dataPoints.length - 1; i++) {
      const a = dataPoints[i];
      const b = dataPoints[i + 1];

      // Calculate angular difference (shortest path)
      const angDiff = Math.abs(((a.dir - b.dir + 540) % 360) - 180);

      // Skip if angular gap > 90° (wraparound artifact)
      if (angDiff > 90) continue;

      // Calculate midpoint radius for opacity
      const midR = (a.r01 + b.r01) / 2;
      const opacity =
        Math.round((0.08 + 0.92 * Math.pow(midR, 1.5)) * 1e6) / 1e6;

      // Use average speed for color
      const avgSpeed = (a.spd + b.spd) / 2;
      const color = getWindColorHex(avgSpeed);

      segments.push({
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        color,
        opacity,
      });
    }

    return segments;
  }, [dataPoints]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onHoverChange || !svgRef.current) return;

    e.preventDefault(); // Prevent page scrolling on touch

    const windowStart = nowOffsetMinutes;
    const windowEnd = nowOffsetMinutes + timeWindowMinutes;
    const rawDataPoints = dataWithOffset.filter(
      (point) => point.minsAgo >= windowStart && point.minsAgo <= windowEnd,
    );
    const nearest = findPointByRadius(
      e.clientX,
      e.clientY,
      rawDataPoints,
      svgRef.current,
      timeWindowMinutes,
      nowOffsetMinutes,
    );
    onHoverChange(nearest);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onHoverChange || !svgRef.current) return;

    // Only process move if pointer is down (buttons !== 0) or it's a touch event
    if (e.buttons === 0 && e.pointerType !== "touch") return;

    e.preventDefault(); // Prevent page scrolling on touch drag

    const windowStart = nowOffsetMinutes;
    const windowEnd = nowOffsetMinutes + timeWindowMinutes;
    const rawDataPoints = dataWithOffset.filter(
      (point) => point.minsAgo >= windowStart && point.minsAgo <= windowEnd,
    );
    const nearest = findPointByRadius(
      e.clientX,
      e.clientY,
      rawDataPoints,
      svgRef.current,
      timeWindowMinutes,
      nowOffsetMinutes,
    );
    onHoverChange(nearest);
  };

  const handlePointerUp = () => {
    if (!onHoverChange) return;
    onHoverChange(null);
  };

  // Calculate timestamp for header
  const headerTimestamp = useMemo(() => {
    if (!displayPoint) return "";
    const now = new Date();
    const pointTime = new Date(
      now.getTime() - displayPoint.minsAgo * 60 * 1000,
    );
    const timeString = formatTime(pointTime);
    const offsetString = formatTimeOffset(displayPoint.minsAgo);
    return `${timeString} · ${offsetString}`;
  }, [displayPoint]);

  return (
    <div
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--surface-border)",
        borderRadius: "12px",
        padding: "10px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "4px",
          fontFamily: "var(--font-body)",
          fontSize: "12px",
        }}
      >
        <span
          style={{
            fontWeight: "600",
            color:
              mode === "reference" ? "var(--text-muted)" : "var(--accent-blue)",
          }}
        >
          {mode === "reference" ? "At reference" : "● At touch"}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
          }}
        >
          {headerTimestamp}
        </span>
      </div>

      {/* Chart container with overlays */}
      <div style={{ position: "relative" }}>
        {/* Left overlay: Direction */}
        {displayPoint && svgDimensions.width > 0 && (
          <div
            style={{
              position: "absolute",
              top: `${svgDimensions.height * 0.0}px`,
              left: `${svgDimensions.width * 0.0}px`,
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "8.5px",
                fontWeight: "600",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "1px",
              }}
            >
              Direction
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "26px",
                fontWeight: "600",
                letterSpacing: "-0.02em",
                lineHeight: "1",
                color: "var(--text-primary)",
              }}
            >
              {Math.round(displayPoint.dir)}°
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "12px",
                fontWeight: "600",
                color: "var(--accent-blue)",
                marginTop: "1px",
              }}
            >
              {getCompassDirection(displayPoint.dir)}
            </div>
          </div>
        )}

        {/* Right overlay: Speed */}
        {displayPoint && svgDimensions.width > 0 && (
          <div
            style={{
              position: "absolute",
              top: `${svgDimensions.height * 0.0}px`,
              right: `${svgDimensions.width * 0.0}px`,
              zIndex: 2,
              pointerEvents: "none",
              textAlign: "right",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "8.5px",
                fontWeight: "600",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                marginBottom: "1px",
              }}
            >
              Speed
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "3px",
                justifyContent: "flex-end",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "26px",
                  fontWeight: "600",
                  lineHeight: "1",
                  color: getWindColorHex(displayPoint.spd),
                }}
              >
                {displayPoint.spd.toFixed(1)}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                }}
              >
                kts
              </span>
            </div>
            <div
              style={{
                fontSize: "10.5px",
                fontWeight: "500",
                marginTop: "1px",
                color: getWindColorHex(displayPoint.spd),
              }}
            >
              {getWindCondition(displayPoint.spd).label}
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox="0 0 360 360"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            touchAction: "none",
            userSelect: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Background gradients */}
          <defs>
            <radialGradient id="bgWash" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F0EDE6" stopOpacity="1" />
              <stop offset="70%" stopColor="#EFEBE2" stopOpacity="1" />
              <stop offset="100%" stopColor="#E8E2D2" stopOpacity="1" />
            </radialGradient>
            <radialGradient id="outerHalo" cx="50%" cy="50%" r="50%">
              <stop offset="92%" stopColor="rgba(0,68,204,0)" />
              <stop offset="100%" stopColor="rgba(0,68,204,0.12)" />
            </radialGradient>
          </defs>

          {/* Background circles */}
          <circle cx={CENTER_X} cy={CENTER_Y} r={R + 6} fill="url(#bgWash)" />
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={R + 6}
            fill="url(#outerHalo)"
          />

          {/* Angle tick lines (every 10°) */}
          {Array.from({ length: 36 }, (_, i) => i * 10).map((angle) => {
            const isCardinal = angle % 90 === 0;
            const isIntercardinal = angle % 45 === 0;
            const isCoarse = angle % 30 === 0;

            const stroke = isCardinal
              ? "rgba(0,0,0,0.32)"
              : isIntercardinal
                ? "rgba(0,0,0,0.18)"
                : isCoarse
                  ? "rgba(0,0,0,0.10)"
                  : "rgba(0,0,0,0.04)";

            const strokeWidth = isCardinal ? 1 : isCoarse ? 0.75 : 0.5;

            // Full radial lines for coarse ticks, short ticks for fine ones
            if (!isCoarse) {
              const [x1, y1] = polarToXY(angle, 0.965, CENTER_X, CENTER_Y, R);
              const [x2, y2] = polarToXY(angle, 1, CENTER_X, CENTER_Y, R);
              return (
                <line
                  key={`tick-${angle}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
              );
            }

            const [x2, y2] = polarToXY(angle, 1, CENTER_X, CENTER_Y, R);
            return (
              <line
                key={`tick-${angle}`}
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={x2}
                y2={y2}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
            );
          })}

          {/* Radial time rings at tick intervals */}
          {radialRings.map((ring) => (
            <circle
              key={`ring-${ring.minutes}`}
              cx={CENTER_X}
              cy={CENTER_Y}
              r={Math.max(0, ring.r01 * R)}
              fill="none"
              stroke={
                ring.isOuterRing ? "rgba(0,68,204,0.55)" : "rgba(0,0,0,0.12)"
              }
              strokeWidth={ring.isOuterRing ? 1.5 : 0.75}
              strokeDasharray={ring.isOuterRing ? "0" : "2 4"}
            />
          ))}

          {/* Time labels on radial rings at North (0°) */}
          {labeledRings.map((ring) => {
            const label = formatTimeOffset(ring.absMinutes);
            const isLiveNow = ring.absMinutes <= 0;
            const isOuterRef = ring.minutes === 0;
            const accent = isLiveNow || isOuterRef;
            const [lx, ly] = polarToXY(0, ring.r01, CENTER_X, CENTER_Y, R);

            // Calculate label width for background box
            const labelWidth = Math.max(24, label.length * 6.2);

            return (
              <g
                key={`label-${ring.minutes}`}
                transform={`translate(${lx + 5}, ${ly + 2})`}
              >
                {/* Background box */}
                <rect
                  x={-3}
                  y={-8}
                  width={labelWidth}
                  height={11}
                  rx={2}
                  fill={
                    accent ? "rgba(0,68,204,0.10)" : "rgba(240,237,230,0.95)"
                  }
                />
                {/* Label text */}
                <text
                  x={0}
                  y={0}
                  fontFamily="var(--font-mono)"
                  fontSize={8.5}
                  fontWeight={accent ? 600 : 500}
                  fill={accent ? "#0044CC" : "#666666"}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Center label showing oldest time in window */}
          {timeWindowMinutes > 0 && (
            <text
              x={CENTER_X}
              y={CENTER_Y + 14}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={8.5}
              fill="rgba(0,0,0,0.4)"
            >
              {formatTimeOffset(nowOffsetMinutes + timeWindowMinutes)}
            </text>
          )}

          {/* Compass labels */}
          {COMPASS_LABELS.map(({ label, angle }) => {
            const [x, y] = polarToXY(
              angle,
              LABEL_RADIUS / R,
              CENTER_X,
              CENTER_Y,
              R,
            );

            return (
              <text
                key={label}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "14px",
                  fill: "var(--text-primary)",
                }}
              >
                {label}
              </text>
            );
          })}

          {/* Line segments connecting data points */}
          {lineSegments.map((segment, i) => (
            <line
              key={`seg-${i}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={segment.color}
              strokeWidth={2.5}
              strokeOpacity={segment.opacity}
              strokeLinecap="round"
            />
          ))}

          {/* Data points as circles */}
          {dataPoints.map((point, i) => {
            // Subsample for performance (show ~28 points max)
            const step = Math.max(1, Math.floor(dataPoints.length / 28));
            if (i % step !== 0 && i !== 0) return null;

            return (
              <circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={2.2}
                fill={point.color}
                opacity={point.opacity}
              />
            );
          })}

          {/* Crosshairs and dotted circle when hovering */}
          {hoverPoint &&
            timeWindowMinutes > 0 &&
            (() => {
              // Calculate position of hover point relative to window
              const relativeAge = hoverPoint.minsAgo - nowOffsetMinutes;
              const r01 = 1 - relativeAge / timeWindowMinutes;
              const [hx, hy] = polarToXY(
                hoverPoint.dir,
                r01,
                CENTER_X,
                CENTER_Y,
                R,
              );
              const hoverRadius = r01 * R;

              return (
                <g>
                  {/* Radial line from center to hover point */}
                  <line
                    x1={CENTER_X}
                    y1={CENTER_Y}
                    x2={hx}
                    y2={hy}
                    stroke="rgba(0,68,204,0.6)"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                  {/* Dotted circle at hover time radius (new visual feedback) */}
                  <circle
                    cx={CENTER_X}
                    cy={CENTER_Y}
                    r={Math.max(0, hoverRadius)}
                    fill="none"
                    stroke="rgba(0,0,0,0.22)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                </g>
              );
            })()}

          {/* Reference point highlighting (current point when not hovering) */}
          {!hoverPoint &&
            dataPoints.length > 0 &&
            (() => {
              // Find reference point at nowOffsetMinutes (outer ring)
              const referencePoint = dataPoints.find(
                (p) => p.minsAgo === nowOffsetMinutes,
              );
              if (!referencePoint) return null;

              const relativeAge = referencePoint.minsAgo - nowOffsetMinutes;
              const r01 = 1 - relativeAge / timeWindowMinutes;
              const [rx, ry] = polarToXY(
                referencePoint.dir,
                r01,
                CENTER_X,
                CENTER_Y,
                R,
              );

              return (
                <g>
                  {/* Blue ring around reference point */}
                  <circle
                    cx={rx}
                    cy={ry}
                    r={6}
                    fill="none"
                    stroke="rgba(0,68,204,0.7)"
                    strokeWidth={2.5}
                  />
                  {/* Blue center dot */}
                  <circle cx={rx} cy={ry} r={3} fill="rgba(0,68,204,0.8)" />
                </g>
              );
            })()}

          {/* Center dot */}
          <circle cx={CENTER_X} cy={CENTER_Y} r={2.5} fill="rgba(0,0,0,0.5)" />
        </svg>
      </div>

      {/* Footer row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 6px 2px 6px",
          borderTop: "1px solid var(--divider)",
          marginTop: "4px",
          paddingTop: "8px",
          fontFamily: "var(--font-body)",
          fontSize: "9px",
          fontWeight: "600",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        <span>0° N · CW</span>
        <span>Outer = {formatTimeOffset(nowOffsetMinutes)}</span>
        <span>{timeScale?.label || `${timeWindowMinutes}m`}</span>
      </div>
    </div>
  );
}

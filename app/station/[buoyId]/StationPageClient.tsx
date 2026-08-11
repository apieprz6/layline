"use client";

import { useState, useMemo } from "react";
import type { WindDataPoint, WindDataPointWithOffset } from "@/types";
import { TIME_SCALES, type TimeScale } from "@/lib/utils/windowing";
import { getMinutesAgo } from "@/lib/utils/time";
import StationLayout from "@/components/dashboard/StationLayout";
import StationHeader from "@/components/dashboard/StationHeader";
import PolarChart from "@/components/dashboard/PolarChart";
import SpeedLineChart from "@/components/dashboard/SpeedLineChart";
import BottomControlsDock from "@/components/dashboard/BottomControlsDock";
import TabbedInfoPanel from "@/components/dashboard/TabbedInfoPanel";

interface StationPageClientProps {
  buoyId: string;
  stationName: string;
  data: WindDataPoint[];
  fetchedAt: string;
  serverTime: number;
}

const TOTAL_HOURS = 72;
const TOTAL_MINUTES = TOTAL_HOURS * 60;

export default function StationPageClient({
  buoyId,
  stationName,
  data,
  fetchedAt,
  serverTime,
}: StationPageClientProps) {
  const [scaleId, setScaleId] = useState<TimeScale>("1h");
  const [hoverPoint, setHoverPoint] = useState<WindDataPointWithOffset | null>(null);
  const [nowOffset, setNowOffset] = useState<number>(0); // Minutes ago from current time (0 = live)

  // Use server-provided time to avoid hydration mismatches
  const now = useMemo(() => new Date(serverTime), [serverTime]);

  // Transform WindDataPoint[] to WindDataPointWithOffset[] by calculating minsAgo
  const dataWithOffset: WindDataPointWithOffset[] = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        minsAgo: getMinutesAgo(point.timestamp, now),
      })),
    [data, now]
  );

  const timeWindowMinutes = TIME_SCALES[scaleId].minutes;

  // Calculate max offset: can't go back more than TOTAL_MINUTES minus current scale
  const maxOffset = TOTAL_MINUTES - timeWindowMinutes;

  // Handle scale change: reset to live if current offset exceeds new scale's max
  const handleScaleChange = (newScale: TimeScale) => {
    const newMaxOffset = TOTAL_MINUTES - TIME_SCALES[newScale].minutes;
    if (nowOffset > newMaxOffset) {
      setNowOffset(0);
    }
    setScaleId(newScale);
  };

  // Calculate reference time and window start for display
  const referenceTime = useMemo(
    () => new Date(serverTime - nowOffset * 60 * 1000),
    [serverTime, nowOffset],
  );
  const windowStart = useMemo(
    () => new Date(serverTime - (nowOffset + timeWindowMinutes) * 60 * 1000),
    [serverTime, nowOffset, timeWindowMinutes],
  );

  // Calculate display point: use hoverPoint if set, otherwise most recent data point
  const displayPoint = useMemo(() => {
    if (hoverPoint) return hoverPoint;
    if (!dataWithOffset || dataWithOffset.length === 0) return undefined;

    // Find point with minsAgo = nowOffset (reference time), or fallback to closest
    const referencePoint = dataWithOffset.find((p) => p.minsAgo === nowOffset);
    if (referencePoint) return referencePoint;

    // Find closest point to reference time
    let closest = dataWithOffset[0];
    let minDiff = Math.abs(dataWithOffset[0]?.minsAgo - nowOffset);
    for (const point of dataWithOffset) {
      const diff = Math.abs(point.minsAgo - nowOffset);
      if (diff < minDiff) {
        minDiff = diff;
        closest = point;
      }
    }
    return closest;
  }, [hoverPoint, dataWithOffset, nowOffset]);

  // Calculate mode: 'touch' when hovering, 'reference' when showing most recent
  const mode: "reference" | "touch" = hoverPoint ? "touch" : "reference";

  // Check if currently at live position
  const isAtLive = nowOffset === 0;

  // Calculate latest data time (most recent sample)
  const latestDataTime = useMemo(() => {
    if (!dataWithOffset || dataWithOffset.length === 0) return new Date();
    const latestPoint = dataWithOffset.find((p) => p.minsAgo === 0) || dataWithOffset[0];
    return new Date(serverTime - latestPoint.minsAgo * 60 * 1000);
  }, [dataWithOffset, serverTime]);

  // Use the actual fetch time from the API response
  const lastFetchTime = useMemo(
    () => new Date(fetchedAt),
    [fetchedAt],
  );

  const hasData = data && data.length > 0;

  return (
    <StationLayout
      header={
        <StationHeader
          stationName={stationName}
          buoyId={buoyId}
          latestDataTime={latestDataTime}
          lastFetchTime={lastFetchTime}
          nowOffset={nowOffset}
          onReturnToLive={() => setNowOffset(0)}
        />
      }
      polarChart={
        hasData ? (
          <PolarChart
            data={data}
            referenceTime={now}
            timeWindowMinutes={timeWindowMinutes}
            nowOffsetMinutes={nowOffset}
            hoverPoint={hoverPoint}
            onHoverChange={setHoverPoint}
            displayPoint={displayPoint}
            mode={mode}
          />
        ) : null
      }
      speedChart={
        hasData ? (
          <div
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--surface-border)",
              borderRadius: "12px",
              padding: "12px 10px 6px 10px",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0 6px 4px 6px",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "9.5px",
                  fontWeight: "600",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                Wind speed
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                }}
              >
                {TIME_SCALES[scaleId].label}
              </span>
            </div>
            <SpeedLineChart
              data={data}
              referenceTime={now}
              timeWindowMinutes={timeWindowMinutes}
              nowOffsetMinutes={nowOffset}
              hoverPoint={hoverPoint}
              onHoverChange={setHoverPoint}
            />
          </div>
        ) : null
      }
      tabbedPanel={
        hasData ? (
          <TabbedInfoPanel
            data={data}
            referenceTime={now}
            timeWindowMinutes={timeWindowMinutes}
            nowOffsetMinutes={nowOffset}
            onOffsetChange={setNowOffset}
            buoyId={buoyId}
            maxOffsetMinutes={maxOffset}
          />
        ) : null
      }
      dock={
        <BottomControlsDock
          scaleId={scaleId}
          nowOffset={nowOffset}
          maxOffset={maxOffset}
          timeWindowMinutes={timeWindowMinutes}
          isLive={isAtLive}
          referenceTime={referenceTime}
          windowStart={windowStart}
          onScaleChange={handleScaleChange}
          onOffsetChange={setNowOffset}
          onReturnToLive={() => setNowOffset(0)}
        />
      }
    />
  );
}

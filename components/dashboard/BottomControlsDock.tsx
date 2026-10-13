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
    <div className="bottom-dock">
      <div className="bottom-dock__row">
        <div className="bottom-dock__scale">
          <ScaleControl activeScale={scaleId} onScaleChange={onScaleChange} />
        </div>
        <button
          onClick={onReturnToLive}
          disabled={isLive}
          className="bottom-dock__live"
        >
          Live →
        </button>
      </div>

      <TimeScrubber
        value={nowOffset}
        max={maxOffset}
        scaleMinutes={timeWindowMinutes}
        onChange={onOffsetChange}
      />

      <div className="bottom-dock__caption">
        {formatDateTimeRange(windowStart)} → {formatDateTimeRange(referenceTime)}
      </div>
    </div>
  );
}

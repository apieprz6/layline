import Link from "next/link";
import type { BuoyDataResult } from "@/types";
import StationRow from "./StationRow";
import { radius, spacing } from "@/lib/utils/design";

interface LiveWindCardProps {
  buoys: BuoyDataResult[];
}

export default function LiveWindCard({ buoys }: LiveWindCardProps) {
  // Find CHII2 and Purdue Buoy (45198) in order
  // Match by buoyId in data, or by error message if offline
  const chii2 = buoys.find(
    (b) =>
      b.data?.buoyId === "CHII2" || (!b.data && !b.error?.includes("Purdue")),
  );
  const purdue = buoys.find(
    (b) =>
      b.data?.buoyId === "45198" || (!b.data && b.error?.includes("Purdue")),
  );

  const displayBuoys = [chii2, purdue].filter(Boolean) as BuoyDataResult[];

  // If no buoys available at all, don't render the card
  if (displayBuoys.length === 0) {
    return null;
  }

  return (
    <div className="layline-card">
      {/* Card header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing(3),
        }}
      >
        <div className="label" style={{ color: "var(--text-secondary)" }}>
          Live Wind
        </div>
        <Link
          href="/dashboard/wind-data"
          style={{
            fontSize: "10px",
            color: "var(--text-accent)",
            textDecoration: "none",
          }}
        >
          See all →
        </Link>
      </div>

      {/* Station rows */}
      <div
        style={{ display: "flex", flexDirection: "column", gap: spacing(2) }}
      >
        {displayBuoys.map((buoy) => {
          if (!buoy.data) return null;
          return (
            <div
              key={buoy.data.buoyId}
              style={{
                borderRadius: radius("md"),
                border: "1px solid var(--surface-border)",
                background: "var(--card-bg)",
              }}
            >
              <StationRow
                buoyId={buoy.data.buoyId}
                windSpeed={buoy.data.windSpeed}
                windDirection={buoy.data.windDirection}
                windGust={buoy.data.windGust}
                status={buoy.status}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

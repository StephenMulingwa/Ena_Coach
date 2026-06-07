"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import PageHeader from "../PageHeader";
import DateFilter from "../DateFilter";
import type { SharedTabProps } from "../../lib/data";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver } from "../../lib/driverDisplay";
import { parseLocationCoords } from "../../lib/mapCoords";
import type { FleetMapUnit } from "./FleetMapInner";

const FleetMapInner = dynamic(() => import("./FleetMapInner"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 420,
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--surface2)",
        color: "var(--text2)",
        fontSize: ".88rem",
        fontWeight: 600,
      }}
    >
      Loading map…
    </div>
  ),
});

export default function MapReport({
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
}: SharedTabProps) {
  const drivers = useMemo(() => data?.drivers ?? [], [data?.drivers]);
  const violations = useMemo(() => data?.violations ?? [], [data?.violations]);
  const rawLocations = useMemo(() => data?.vehicleLocations ?? [], [data?.vehicleLocations]);

  const extraMissingVehicles = useMemo(
    () => drivers.filter((d) => isMissingDriver(d.name)).map((d) => d.vehicle),
    [drivers],
  );

  const missingOrdinalByVehicle = useMemo(
    () => buildVehicleMissingOrdinalMap(violations, [], [], extraMissingVehicles),
    [violations, extraMissingVehicles],
  );

  const mapUnits = useMemo((): FleetMapUnit[] => {
    const seen = new Set<string>();
    const units: FleetMapUnit[] = [];

    for (const loc of rawLocations) {
      const coords = parseLocationCoords(loc.locationCoords);
      if (!coords) continue;

      const id = `${loc.vehicle}-${coords.lat}-${coords.lon}`;
      if (seen.has(id)) continue;
      seen.add(id);

      units.push({
        id,
        vehicle: loc.vehicle,
        driver: formatDriverDisplay({
          vehicle: loc.vehicle,
          rawDriver: loc.driver,
          missingOrdinalByVehicle,
          violations,
        }),
        location: loc.location || "Unknown",
        lastSeen: loc.lastCoordinatesTime || loc.lastMessageTime || "N/A",
        lat: coords.lat,
        lon: coords.lon,
      });
    }

    return units.sort((a, b) => a.vehicle.localeCompare(b.vehicle));
  }, [rawLocations, missingOrdinalByVehicle, violations]);

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <PageHeader
        title="Fleet"
        titleAccent="Map"
        right={
          <DateFilter
            startDate={startDate}
            endDate={endDate}
            onStartChange={onStartChange}
            onEndChange={onEndChange}
            onRun={onRun}
            running={loading}
          />
        }
      />
      {error && (
        <p style={{ color: "var(--red)", marginBottom: 12, fontSize: ".82rem", fontWeight: 600 }}>{error}</p>
      )}
      <FleetMapInner units={mapUnits} loading={loading} onRefresh={onRun} />
    </div>
  );
}

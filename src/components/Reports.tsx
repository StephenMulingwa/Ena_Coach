"use client";

import { useMemo } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import type { FinalReportRow, SharedTabProps } from "../lib/data";
import * as XLSX from "xlsx";

function makeTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

const columns = [
  { key: "driver", label: "Driver" },
  { key: "vehicle", label: "Vehicle" },
  { key: "avgFuelConsumption", label: "Avg Fuel (km/L)" },
  { key: "distanceKm", label: "Distance (km)" },
  { key: "avgSpeedKmH", label: "Avg Speed (km/h)" },
  { key: "engineRunningTime", label: "Engine Time" },
  { key: "idlingEngineTime", label: "Idling Engine Time" },
  { key: "harshCornering", label: "Harsh Cornering" },
  { key: "harshCorneringPer100", label: "Harsh Cornering #/100" },
  { key: "overSpeeding", label: "Over Speeding" },
  { key: "overSpeedingPer100", label: "Over Speeding #/100" },
  { key: "harshBraking", label: "Harsh Braking" },
  { key: "harshBrakingPer100", label: "Harsh Braking #/100" },
  { key: "freeWheeling", label: "Free Wheeling" },
  { key: "freeWheelingPer100", label: "Free Wheeling #/100" },
  { key: "overRevving", label: "Over Revving" },
  { key: "overRevvingPer100", label: "Over Revving #/100" },
  { key: "idlingPercent", label: "Idling % of Engine Running" },
  { key: "engineOverspeedPercent", label: "Engine Overspeed % of Engine Running Time" },
  { key: "fuelConsumptionDiesel", label: "Fuel Consumed Diesel (L)" },
  { key: "fuelConsumptionIdlingDiesel", label: "Fuel Consumption idling Diesel (L)" },
  { key: "totalFuelFilled", label: "Total Fuel Filled" },
  { key: "fuelFillsCount", label: "# Fuel Fills" },
  { key: "totalFuelDrained", label: "Total Fuel Drained" },
  { key: "fuelDrainsCount", label: "# Fuel Drains" },
] as const;

type ReportRow = FinalReportRow & {
  harshCornering: number;
  harshCorneringPer100: number;
  overSpeeding: number;
  overSpeedingPer100: number;
  harshBraking: number;
  harshBrakingPer100: number;
  freeWheeling: number;
  freeWheelingPer100: number;
  overRevving: number;
  overRevvingPer100: number;
  totalFuelFilled: number;
  fuelFillsCount: number;
  totalFuelDrained: number;
  fuelDrainsCount: number;
};

function downloadXlsx(rows: ReportRow[]) {
  const exportRows = rows.map((row) =>
    columns.reduce<Record<string, string | number>>((acc, c) => {
      const val = row[c.key as keyof typeof row];
      acc[c.label] = val ?? "";
      return acc;
    }, {}),
  );
  const sheet = XLSX.utils.json_to_sheet(exportRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Fleet Reports");
  XLSX.writeFile(book, `ena_fleet_report_${makeTimestamp()}.xlsx`);
}

function durationToSeconds(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const dayMatch = normalized.match(/(\d+)\s+days?/i);
  const days = dayMatch ? Number(dayMatch[1]) : 0;
  const timeMatch = normalized.match(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/);
  const timePart = timeMatch ? timeMatch[1] : normalized;
  const parts = timePart.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return (days * 86400) + (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (days * 86400) + (parts[0] * 60) + parts[1];
  return 0;
}

export default function Reports({
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
}: SharedTabProps) {
  const rows = useMemo(() => {
    const finalReport = data?.finalReport ?? [];
    const violations = data?.violations ?? [];
    const drivers = data?.drivers ?? [];
    const countsByDriverVehicle = new Map<string, Record<string, number>>();
    const keyFor = (driver: string, vehicle: string) => `${driver}|||${vehicle}`;
    const driverSummaryByKey = new Map(
      drivers.map((driver) => [keyFor(driver.name, driver.vehicle), driver]),
    );

    violations.forEach((v) => {
      const violationName = v.violation?.trim();
      if (!violationName) return;
      const key = keyFor(v.driver, v.vehicle);
      const current = countsByDriverVehicle.get(key) ?? {};
      current[violationName] = (current[violationName] ?? 0) + 1;
      countsByDriverVehicle.set(key, current);
    });

    return finalReport.map((row) => {
      const violationCounts = countsByDriverVehicle.get(keyFor(row.driver, row.vehicle)) ?? {};
      const summary = driverSummaryByKey.get(keyFor(row.driver, row.vehicle));
      const distance = row.distanceKm || 0;
      const per100 = (count: number) => (distance > 0 ? (count / distance) * 100 : 0);
      const engineSeconds = durationToSeconds(row.engineRunningTime);
      const idlingSeconds = durationToSeconds(row.idlingEngineTime || row.engineRunningTimeIdling || "00:00:00");
      const idlingPercent = engineSeconds > 0 ? (idlingSeconds / engineSeconds) * 100 : 0;
      return {
        ...row,
        harshCornering: violationCounts["Harsh Cornering"] ?? 0,
        harshCorneringPer100: per100(violationCounts["Harsh Cornering"] ?? 0),
        overSpeeding: violationCounts["Over Speeding"] ?? 0,
        overSpeedingPer100: per100(violationCounts["Over Speeding"] ?? 0),
        harshBraking: violationCounts["Harsh Braking"] ?? 0,
        harshBrakingPer100: per100(violationCounts["Harsh Braking"] ?? 0),
        freeWheeling: violationCounts["Free Wheeling"] ?? 0,
        freeWheelingPer100: per100(violationCounts["Free Wheeling"] ?? 0),
        overRevving: violationCounts["Over Revving"] ?? 0,
        overRevvingPer100: per100(violationCounts["Over Revving"] ?? 0),
        idlingEngineTime: row.idlingEngineTime || row.engineRunningTimeIdling || "00:00:00",
        idlingPercent: row.idlingPercent ?? idlingPercent,
        totalFuelFilled: summary?.fuelFilled ?? 0,
        fuelFillsCount: summary?.totalFillings ?? row.totalFillings ?? 0,
        totalFuelDrained: summary?.fuelDrained ?? 0,
        fuelDrainsCount: summary?.totalDrains ?? row.fuelDrains ?? 0,
      };
    });
  }, [data]);
  const zeroDecimalKeys = new Set(["distanceKm", "avgSpeedKmH", "fuelConsumptionDiesel"]);
  const percentageKeys = new Set([
    "harshCorneringPer100",
    "overSpeedingPer100",
    "harshBrakingPer100",
    "freeWheelingPer100",
    "overRevvingPer100",
    "idlingPercent",
    "engineOverspeedPercent",
  ]);

  const thStyle: React.CSSProperties = {
    padding: "11px 12px",
    textAlign: "left",
    fontFamily: "var(--font-body)",
    fontSize: ".65rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".05em",
    color: "#000000",
    whiteSpace: "nowrap",
  };

  return (
    <div>
      <PageHeader
        title="Fleet"
        titleAccent="Reports"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <DateFilter
              startDate={startDate}
              endDate={endDate}
              onStartChange={onStartChange}
              onEndChange={onEndChange}
              onRun={onRun}
              running={loading}
            />
            <button
              onClick={() => downloadXlsx(rows)}
              style={{
                padding: "8px 14px",
                background: "rgba(22,163,74,0.1)",
                border: "1px solid rgba(22,163,74,0.35)",
                borderRadius: "var(--radius-sm)",
                color: "#15803d",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Export XLSX
            </button>
          </div>
        }
      />
      {error && <p style={{ color: "var(--red)", marginBottom: 12, fontSize: ".82rem" }}>{error}</p>}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: ".8rem", whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                <th style={thStyle}>#</th>
                {columns.map((c) => (
                  <th key={c.key} style={thStyle}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px", color: "var(--text3)" }}>{idx + 1}</td>
                  {columns.map((c) => {
                    const val = row[c.key as keyof typeof row];
                    if (val === null || val === undefined) {
                      return <td key={c.key} style={{ padding: "10px 12px" }}><span style={{ color: "var(--text3)" }}>—</span></td>;
                    }
                    const displayValue = typeof val === "number" && zeroDecimalKeys.has(c.key)
                      ? val.toFixed(0)
                      : typeof val === "number" && percentageKeys.has(c.key)
                        ? val.toFixed(2)
                        : typeof val === "number"
                          ? val.toFixed(2)
                          : String(val);
                    return <td key={c.key} style={{ padding: "10px 12px" }}>{displayValue}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


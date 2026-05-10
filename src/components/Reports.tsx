"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import { type FinalReportRow, type SharedTabProps, type SpeedRecord } from "../lib/data";
import * as XLSX from "xlsx";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver } from "../lib/driverDisplay";
import { downloadPdfTable } from "../lib/exportPdfTable";
import { makeTimestamp } from "../lib/violationReportsExport";

const REPORT_SPEED_DRIVER_SEP = "\x1f";

function reportSpeedDriverKey(vehicle: string, driver: string) {
  return `${String(vehicle ?? "").trim()}${REPORT_SPEED_DRIVER_SEP}${String(driver ?? "").trim()}`;
}

function parseReportSpeedDriverKey(key: string): { vehicle: string; driver: string } | null {
  const i = key.indexOf(REPORT_SPEED_DRIVER_SEP);
  if (i < 0) return null;
  return { vehicle: key.slice(0, i), driver: key.slice(i + REPORT_SPEED_DRIVER_SEP.length) };
}

const SPEED_PAGE_SIZE = 10;

const columns = [
  { key: "driver", label: "Driver" },
  { key: "vehicle", label: "Vehicle" },
  { key: "avgFuelConsumption", label: "Avg Fuel (km/L)" },
  { key: "distanceKm", label: "Distance (km)" },
  { key: "fuelConsumptionDiesel", label: "Fuel Consumed (L)" },
  { key: "engineRunningTime", label: "Engine Hours" },
  { key: "idlingEngineTime", label: "Idling Engine Time" },
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

function downloadXlsx(rows: ReportRow[], formatDriverCell: (vehicle: string, rawDriver: string) => string) {
  const exportRows = rows.map((row) =>
    columns.reduce<Record<string, string | number>>((acc, c) => {
      const val = row[c.key as keyof typeof row];
      acc[c.label] =
        c.key === "driver"
          ? formatDriverCell(String(row.vehicle ?? ""), String(val ?? ""))
          : (val ?? "");
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
  if (!normalized || normalized === "-----" || normalized === "—") return 0;
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

function secondsToDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const dayRemainder = safe % 86400;
  const hh = String(Math.floor(dayRemainder / 3600)).padStart(2, "0");
  const mm = String(Math.floor((dayRemainder % 3600) / 60)).padStart(2, "0");
  const ss = String(dayRemainder % 60).padStart(2, "0");
  const timePart = `${hh}:${mm}:${ss}`;
  return days > 0 ? `${days} day${days === 1 ? "" : "s"} ${timePart}` : timePart;
}

function exportSpeedPdf(
  rows: SpeedRecord[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
) {
  downloadPdfTable({
    title: "Filtered speed monitoring",
    head: [["Grouping", "Driver", "Vehicle", "Initial location", "Final location", "Mileage", "Avg. speed", "Duration"]],
    body: rows.map((r) => [
      r.grouping,
      formatDriverCell(r.vehicle, r.driver),
      r.vehicle,
      r.initialLocation,
      r.finalLocation,
      r.mileage,
      r.avgSpeed,
      r.duration,
    ]),
    fileName: `speed_filtered_${makeTimestamp()}.pdf`,
    landscape: true,
  });
}

function exportSpeedXlsx(rows: SpeedRecord[], formatDriverCell: (vehicle: string, rawDriver: string) => string) {
  const sheetRows = rows.map((r) => ({
    Grouping: r.grouping,
    Driver: formatDriverCell(r.vehicle, r.driver),
    Vehicle: r.vehicle,
    "Initial location": r.initialLocation,
    "Final location": r.finalLocation,
    Mileage: r.mileage,
    "Avg. speed": r.avgSpeed,
    Duration: r.duration,
  }));
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Speed Monitoring");
  XLSX.writeFile(book, `speed_monitoring_${makeTimestamp()}.xlsx`);
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
  const [speedRange, setSpeedRange] = useState<"0-30" | "31-60" | "61-80" | "81+">("0-30");
  const [speedDriverKey, setSpeedDriverKey] = useState<string>("ALL");
  const [speedVehicle, setSpeedVehicle] = useState("All");
  const [speedPage, setSpeedPage] = useState(1);
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

  const violations = useMemo(() => data?.violations ?? [], [data?.violations]);
  const speedRecords = useMemo(() => data?.speed ?? [], [data?.speed]);
  const driversSummary = useMemo(() => data?.drivers ?? [], [data?.drivers]);
  const fuelFillings = useMemo(() => data?.fuelFillings ?? [], [data?.fuelFillings]);
  const fuelDrains = useMemo(() => data?.fuelDrains ?? [], [data?.fuelDrains]);

  const extraMissingVehicles = useMemo(
    () => driversSummary.filter((d) => isMissingDriver(d.name)).map((d) => d.vehicle),
    [driversSummary],
  );
  const missingOrdinalByVehicle = useMemo(
    () => buildVehicleMissingOrdinalMap(violations, fuelFillings, fuelDrains, extraMissingVehicles),
    [violations, fuelFillings, fuelDrains, extraMissingVehicles],
  );

  const formatDriverCell = useCallback(
    (vehicle: string, rawDriver: string) =>
      formatDriverDisplay({
        vehicle,
        rawDriver,
        missingOrdinalByVehicle,
        violations,
      }),
    [missingOrdinalByVehicle, violations],
  );

  const zeroDecimalKeys = new Set(["distanceKm", "fuelConsumptionDiesel"]);
  const percentageKeys = new Set<string>();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- speed table resets to page 1 when scope changes
    setSpeedPage(1);
  }, [speedRange, speedDriverKey, speedVehicle, startDate, endDate]);

  const speedVehicles = useMemo(
    () => [...new Set(speedRecords.map((r) => r.vehicle).filter(Boolean))].sort(),
    [speedRecords],
  );

  const speedDriverOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const r of speedRecords) {
      const v = String(r.vehicle ?? "").trim();
      const d = String(r.driver ?? "").trim();
      if (!v && !d) continue;
      const key = reportSpeedDriverKey(v, d);
      const driverLabel = formatDriverDisplay({
        vehicle: v,
        rawDriver: d,
        missingOrdinalByVehicle,
        violations,
      });
      byKey.set(key, driverLabel);
    }
    return [...byKey.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [speedRecords, missingOrdinalByVehicle, violations]);

  const toSpeedNumber = (value: string) => {
    const m = String(value ?? "").match(/([0-9]+(?:\.[0-9]+)?)/);
    return m ? Number(m[1]) : 0;
  };

  const filteredSpeed = useMemo(() => {
    const inRange = (speed: number) => {
    if (speedRange === "0-30") return speed >= 0 && speed <= 30;
    if (speedRange === "31-60") return speed >= 31 && speed <= 60;
    if (speedRange === "61-80") return speed >= 61 && speed <= 80;
    return speed >= 81;
  };
    return speedRecords
      .filter((r) => toSpeedNumber(r.avgSpeed) !== 0)
      .filter((r) => {
        if (speedDriverKey === "ALL") return true;
        const parsed = parseReportSpeedDriverKey(speedDriverKey);
        if (!parsed) return false;
        return String(r.vehicle ?? "").trim() === parsed.vehicle && String(r.driver ?? "").trim() === parsed.driver;
      })
      .filter((r) => (speedVehicle === "All" ? true : r.vehicle === speedVehicle))
      .filter((r) => inRange(toSpeedNumber(r.avgSpeed)));
  }, [speedRecords, speedDriverKey, speedVehicle, speedRange]);

  const orderedSpeed = useMemo(
    () =>
      filteredSpeed
        .slice()
        // Speed table typically lacks timestamps; keep stable ordering via grouping/driver.
        .sort((a, b) => String(a.grouping).localeCompare(String(b.grouping)) || String(a.driver).localeCompare(String(b.driver))),
    [filteredSpeed],
  );

  const speedBands = useMemo(() => {
    const base = speedRecords
      .filter((r) => toSpeedNumber(r.avgSpeed) !== 0)
      .filter((r) => {
        if (speedDriverKey === "ALL") return true;
        const parsed = parseReportSpeedDriverKey(speedDriverKey);
        if (!parsed) return false;
        return String(r.vehicle ?? "").trim() === parsed.vehicle && String(r.driver ?? "").trim() === parsed.driver;
      })
      .filter((r) => (speedVehicle === "All" ? true : r.vehicle === speedVehicle));

    const bands = [
      { id: "0-30", label: "0-30 km/h", min: 0, max: 30, color: "#2f6fed" },
      { id: "31-60", label: "31-60 km/h", min: 31, max: 60, color: "#10b981" },
      { id: "61-80", label: "61-80 km/h", min: 61, max: 80, color: "#f59e0b" },
      { id: "81+", label: "81+ km/h", min: 81, max: Number.POSITIVE_INFINITY, color: "#ef4444" },
    ] as const;

    return bands.map((b) => {
      const rowsInBand = base.filter((r) => {
        const s = toSpeedNumber(r.avgSpeed);
        return s >= b.min && s <= b.max;
      });
      const totalSeconds = rowsInBand.reduce((sum, r) => sum + durationToSeconds(r.duration), 0);
      return {
        ...b,
        count: rowsInBand.length,
        duration: secondsToDuration(totalSeconds),
      };
    });
  }, [speedRecords, speedDriverKey, speedVehicle]);

  const speedTotalPages = Math.max(1, Math.ceil(orderedSpeed.length / SPEED_PAGE_SIZE));
  const pagedSpeed = orderedSpeed.slice((speedPage - 1) * SPEED_PAGE_SIZE, speedPage * SPEED_PAGE_SIZE);

  const thStyle: CSSProperties = {
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
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "auto", overflowY: "visible" }}>
      <PageHeader
        title="Fleet"
        titleAccent="Reports"
        right={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 8,
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
            }}
          >
            <DateFilter
              startDate={startDate}
              endDate={endDate}
              onStartChange={onStartChange}
              onEndChange={onEndChange}
              onRun={onRun}
              running={loading}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
            <button
                type="button"
              onClick={() => downloadXlsx(rows, formatDriverCell)}
              style={{
                padding: "8px 14px",
                background: "rgba(22,163,74,0.1)",
                border: "1px solid rgba(22,163,74,0.35)",
                borderRadius: "var(--radius-sm)",
                color: "#15803d",
                fontWeight: 700,
                cursor: "pointer",
                  whiteSpace: "nowrap",
              }}
            >
              Export XLSX
            </button>
            </div>
          </div>
        }
      />
      {error && <p style={{ color: "var(--red)", marginBottom: 12, fontSize: ".82rem" }}>{error}</p>}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
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
                    return (
                      <td key={c.key} style={{ padding: "10px 12px" }}>
                        {c.key === "driver"
                          ? formatDriverCell(String(row.vehicle ?? ""), String(row.driver ?? ""))
                          : displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, color: "var(--text)", fontSize: ".92rem" }}>
            Speed Monitoring
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Speed Range</span>
            <select
              value={speedRange}
              onChange={(e) => setSpeedRange(e.target.value as typeof speedRange)}
              style={{
                padding: "6px 10px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: ".76rem",
                fontWeight: 600,
                outline: "none",
                colorScheme: "light",
                cursor: "pointer",
                minWidth: "170px",
              }}
            >
              <option value="0-30">0-30 km/h</option>
              <option value="31-60">31-60 km/h</option>
              <option value="61-80">61-80 km/h</option>
              <option value="81+">81+ km/h</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Vehicle</span>
            <select
              value={speedVehicle}
              onChange={(e) => setSpeedVehicle(e.target.value)}
              style={{
                padding: "6px 10px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: ".76rem",
                fontWeight: 600,
                outline: "none",
                colorScheme: "light",
                cursor: "pointer",
                minWidth: "170px",
              }}
            >
              <option value="All">All Vehicles</option>
              {speedVehicles.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Driver</span>
            <select
              value={speedDriverKey}
              onChange={(e) => setSpeedDriverKey(e.target.value)}
              style={{
                padding: "6px 10px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: ".76rem",
                fontWeight: 600,
                outline: "none",
                colorScheme: "light",
                cursor: "pointer",
                minWidth: "190px",
              }}
            >
              <option value="ALL">All Drivers</option>
              {speedDriverOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => exportSpeedPdf(orderedSpeed, formatDriverCell)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(47,111,237,0.35)",
                background: "rgba(47,111,237,0.1)",
                color: "var(--blue)",
                fontWeight: 700,
                fontSize: ".76rem",
                cursor: "pointer",
              }}
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => exportSpeedXlsx(orderedSpeed, formatDriverCell)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(22,163,74,0.35)",
                background: "rgba(22,163,74,0.1)",
                color: "#15803d",
                fontWeight: 700,
                fontSize: ".76rem",
                cursor: "pointer",
              }}
            >
              Download Filtered Speed (XLSX)
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", marginBottom: "14px" }}>
          {speedBands.map((b) => (
            <div key={b.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", padding: "18px 18px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${b.color}, transparent)` }} />
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 900, fontSize: "1.75rem", color: "var(--text)", lineHeight: 1 }}>
                    {b.count.toLocaleString()}
                  </div>
                  <div style={{ marginTop: 8, fontSize: ".72rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>
                    {b.label}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: ".68rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>
                    Duration
                  </div>
                  <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: ".88rem", fontWeight: 800, color: "var(--text)" }}>
                    {b.duration}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
          <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1100px" }}>
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                  {["#", "Grouping", "Driver", "Vehicle", "Initial Location", "Final Location", "Mileage", "Avg. speed", "Duration"].map((h) => (
                    <th key={h} style={{ ...thStyle, textAlign: ["Avg Speed", "Max Speed", "Duration", "Mileage"].includes(h) ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedSpeed.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "36px", color: "var(--text3)" }}>
                      No speed records found for this selection.
                    </td>
                  </tr>
                ) : (
                  pagedSpeed.map((r, idx) => (
                    <tr key={`${r.id}-${idx}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", color: "var(--text3)" }}>
                        {(speedPage - 1) * SPEED_PAGE_SIZE + idx + 1}
                      </td>
                      <td style={{ padding: "10px 14px" }}>{r.grouping}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatDriverCell(r.vehicle, r.driver)}</td>
                      <td style={{ padding: "10px 14px" }}>{r.vehicle}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <a
                          href={`https://www.google.com/maps?q=${encodeURIComponent(r.initialLocationCoords || r.initialLocation)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                        >
                          {r.initialLocation || "—"}
                        </a>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <a
                          href={`https://www.google.com/maps?q=${encodeURIComponent(r.finalLocationCoords || r.finalLocation)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                        >
                          {r.finalLocation || "—"}
                        </a>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{r.mileage}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{r.avgSpeed}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{r.duration}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => setSpeedPage((p) => Math.max(1, p - 1))}
              disabled={speedPage === 1}
              style={{ padding: "6px 10px", fontSize: ".75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface2)", cursor: speedPage === 1 ? "not-allowed" : "pointer", opacity: speedPage === 1 ? 0.6 : 1 }}
            >
              Prev
            </button>
            <span style={{ fontSize: ".75rem", color: "var(--text2)", minWidth: 80, textAlign: "center" }}>
              Page {speedPage} / {speedTotalPages}
            </span>
            <button
              onClick={() => setSpeedPage((p) => Math.min(speedTotalPages, p + 1))}
              disabled={speedPage === speedTotalPages}
              style={{ padding: "6px 10px", fontSize: ".75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface2)", cursor: speedPage === speedTotalPages ? "not-allowed" : "pointer", opacity: speedPage === speedTotalPages ? 0.6 : 1 }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


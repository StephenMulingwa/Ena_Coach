"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import PageHeader from "../PageHeader";
import DateFilter from "../DateFilter";
import { type SharedTabProps, type SpeedRecord } from "../../lib/data";
import * as XLSX from "xlsx";
import {
  buildVehicleMissingOrdinalMap,
  formatDriverDisplay,
  isMissingDriver,
} from "../../lib/driverDisplay";
import { exportEnaReportPdf, formatDateRangeLabel } from "../../lib/exportEnaReportPdf";
import { makeTimestamp } from "../../lib/violationReportsExport";
import {
  SortHeader,
  parseDurationSeconds,
  parseFirstNumber,
  sortRowsBy,
  useTableSort,
} from "../../lib/sortableTable";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { LAYOUT_NARROW_QUERY } from "../../lib/breakpoints";

const REPORT_SPEED_DRIVER_SEP = "\x1f";
const SPEED_PAGE_SIZE = 10;

function reportSpeedDriverKey(vehicle: string, driver: string) {
  return `${String(vehicle ?? "").trim()}${REPORT_SPEED_DRIVER_SEP}${String(driver ?? "").trim()}`;
}

function parseReportSpeedDriverKey(key: string): { vehicle: string; driver: string } | null {
  const i = key.indexOf(REPORT_SPEED_DRIVER_SEP);
  if (i < 0) return null;
  return { vehicle: key.slice(0, i), driver: key.slice(i + REPORT_SPEED_DRIVER_SEP.length) };
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

interface SpeedBandWithRows {
  id: string;
  label: string;
  count: number;
  duration: string;
  rows: SpeedRecord[];
}

function exportSpeedPdf(
  bandsWithRows: SpeedBandWithRows[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
  meta: {
    startDate: string;
    endDate: string;
    vehicleScope: string;
    driverScope: string;
  },
) {
  const head = [[
    "#",
    "Driver",
    "Vehicle",
    "Initial Location",
    "Final Location",
    "Mileage",
    "Avg. speed",
    "Duration",
  ]];

  const totalTrips = bandsWithRows.reduce((sum, b) => sum + b.count, 0);

  const sections = bandsWithRows.map((band) => ({
    heading: `${band.label} — ${band.count.toLocaleString()} trip${band.count === 1 ? "" : "s"} · Duration ${band.duration}`,
    head,
    body:
      band.rows.length === 0
        ? [["—", "No trips recorded in this band.", "", "", "", "", "", ""]]
        : band.rows.map((r, idx) => [
            idx + 1,
            formatDriverCell(r.vehicle, r.driver),
            r.vehicle,
            r.initialLocation || "—",
            r.finalLocation || "—",
            r.mileage,
            r.avgSpeed,
            r.duration,
          ]),
  }));

  void exportEnaReportPdf({
    title: "Ena Fleet Speed Monitoring Report",
    subtitle: formatDateRangeLabel(meta.startDate, meta.endDate),
    summary: [
      { label: "Total Trips", value: totalTrips.toLocaleString() },
      ...bandsWithRows.map((b) => ({
        label: b.label,
        value: `${b.count.toLocaleString()} · ${b.duration}`,
      })),
    ],
    narrative:
      totalTrips === 0
        ? `No speed records were found for ${meta.vehicleScope} · ${meta.driverScope}.`
        : `Speed monitoring across all bands for ${meta.vehicleScope} · ${meta.driverScope}. Each section below lists the trips in one band.`,
    sections,
    fileName: `ena_fleet_speed_monitoring_${makeTimestamp()}.pdf`,
    landscape: true,
  });
}

function exportSpeedXlsx(
  bandsWithRows: SpeedBandWithRows[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
) {
  const book = XLSX.utils.book_new();
  // Make sheet names unique and valid (max 31 chars, no /\?*[]).
  const usedNames = new Set<string>();
  for (const band of bandsWithRows) {
    const sheetRows = band.rows.map((r) => ({
      Driver: formatDriverCell(r.vehicle, r.driver),
      Vehicle: r.vehicle,
      "Initial location": r.initialLocation,
      "Final location": r.finalLocation,
      Mileage: r.mileage,
      "Avg. speed": r.avgSpeed,
      Duration: r.duration,
    }));
    const sheet = sheetRows.length
      ? XLSX.utils.json_to_sheet(sheetRows)
      : XLSX.utils.aoa_to_sheet([
          ["Driver", "Vehicle", "Initial location", "Final location", "Mileage", "Avg. speed", "Duration"],
          ["No trips recorded in this band."],
        ]);
    let baseName = band.label.replace(/[\\/?*[\]]/g, "-").slice(0, 31);
    let name = baseName;
    let suffix = 2;
    while (usedNames.has(name)) {
      const candidate = `${baseName.slice(0, 28)} (${suffix})`;
      name = candidate.slice(0, 31);
      suffix += 1;
    }
    usedNames.add(name);
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  XLSX.writeFile(book, `ena_fleet_speed_monitoring_${makeTimestamp()}.xlsx`);
}

export default function SpeedMonitoringReport({
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
  const isNarrow = useMediaQuery(LAYOUT_NARROW_QUERY);

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

  type SpeedSortKey =
    | "driver"
    | "vehicle"
    | "initialLocation"
    | "finalLocation"
    | "mileage"
    | "avgSpeed"
    | "duration";
  const { sort: speedSort, toggleSort: toggleSpeedSort } = useTableSort<SpeedSortKey>({
    key: "vehicle",
    dir: "asc",
  });
  const orderedSpeed = useMemo(
    () =>
      sortRowsBy(filteredSpeed, speedSort, (row, key) => {
        switch (key) {
          case "driver":
            return formatDriverCell(row.vehicle, row.driver);
          case "vehicle":
            return row.vehicle;
          case "initialLocation":
            return row.initialLocation;
          case "finalLocation":
            return row.finalLocation;
          case "mileage":
            return parseFirstNumber(row.mileage);
          case "avgSpeed":
            return parseFirstNumber(row.avgSpeed);
          case "duration":
            return parseDurationSeconds(row.duration);
          default:
            return 0;
        }
      }),
    [filteredSpeed, speedSort, formatDriverCell],
  );

  // Rows scoped only by vehicle/driver filters — band-agnostic. We pre-compute
  // this once so the band cards (UI), the active-band table (UI), and the
  // download exports can all reuse it.
  const baseSpeedRecords = useMemo(
    () =>
      speedRecords
        .filter((r) => toSpeedNumber(r.avgSpeed) !== 0)
        .filter((r) => {
          if (speedDriverKey === "ALL") return true;
          const parsed = parseReportSpeedDriverKey(speedDriverKey);
          if (!parsed) return false;
          return (
            String(r.vehicle ?? "").trim() === parsed.vehicle &&
            String(r.driver ?? "").trim() === parsed.driver
          );
        })
        .filter((r) => (speedVehicle === "All" ? true : r.vehicle === speedVehicle)),
    [speedRecords, speedDriverKey, speedVehicle],
  );

  const speedBands = useMemo(() => {
    const bands = [
      { id: "0-30", label: "0-30 km/h", min: 0, max: 30, color: "#2f6fed" },
      { id: "31-60", label: "31-60 km/h", min: 31, max: 60, color: "#10b981" },
      { id: "61-80", label: "61-80 km/h", min: 61, max: 80, color: "#f59e0b" },
      { id: "81+", label: "81+ km/h", min: 81, max: Number.POSITIVE_INFINITY, color: "#ef4444" },
    ] as const;

    return bands.map((b) => {
      const rowsInBand = baseSpeedRecords.filter((r) => {
        const s = toSpeedNumber(r.avgSpeed);
        return s >= b.min && s <= b.max;
      });
      const totalSeconds = rowsInBand.reduce((sum, r) => sum + durationToSeconds(r.duration), 0);
      return {
        ...b,
        count: rowsInBand.length,
        duration: secondsToDuration(totalSeconds),
        rows: rowsInBand,
      };
    });
  }, [baseSpeedRecords]);

  /** Same data as `speedBands`, but with rows sorted per band the same way the
   *  on-screen table is sorted, so downloads match what the user expects. */
  const speedBandsForDownload = useMemo(
    () =>
      speedBands.map((band) => ({
        id: band.id,
        label: band.label,
        count: band.count,
        duration: band.duration,
        rows: sortRowsBy(band.rows, speedSort, (row, key) => {
          switch (key) {
            case "driver":
              return formatDriverCell(row.vehicle, row.driver);
            case "vehicle":
              return row.vehicle;
            case "initialLocation":
              return row.initialLocation;
            case "finalLocation":
              return row.finalLocation;
            case "mileage":
              return parseFirstNumber(row.mileage);
            case "avgSpeed":
              return parseFirstNumber(row.avgSpeed);
            case "duration":
              return parseDurationSeconds(row.duration);
            default:
              return 0;
          }
        }),
      })),
    [speedBands, speedSort, formatDriverCell],
  );

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
        title="Speed"
        titleAccent="Monitoring"
        subtitle="Trip-level speed bands and detailed records per vehicle"
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
      {error && <p style={{ color: "var(--red)", marginBottom: 12, fontSize: ".82rem" }}>{error}</p>}

      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
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
            onClick={() =>
              exportSpeedPdf(speedBandsForDownload, formatDriverCell, {
                startDate,
                endDate,
                vehicleScope: speedVehicle === "All" ? "All Vehicles" : speedVehicle,
                driverScope:
                  speedDriverKey === "ALL"
                    ? "All Drivers"
                    : (speedDriverOptions.find((o) => o.value === speedDriverKey)?.label ?? "Selected Driver"),
              })
            }
            style={{
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(220,38,38,0.35)",
              background: "rgba(220,38,38,0.1)",
              color: "#b91c1c",
              fontWeight: 700,
              fontSize: ".76rem",
              cursor: "pointer",
            }}
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => exportSpeedXlsx(speedBandsForDownload, formatDriverCell)}
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
            Download All Bands (XLSX)
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isNarrow
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(auto-fit, minmax(240px, 1fr))",
          gap: isNarrow ? 10 : 14,
          marginBottom: 14,
        }}
      >
        {speedBands.map((b) => {
          const isActive = b.id === speedRange;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setSpeedRange(b.id as typeof speedRange)}
              aria-pressed={isActive}
              style={{
                appearance: "none",
                textAlign: "left",
                cursor: "pointer",
                background: "var(--surface)",
                border: isActive ? `2px solid ${b.color}` : "1px solid var(--border)",
                borderRadius: "var(--radius)",
                boxShadow: isActive ? `0 0 0 3px ${b.color}22, var(--shadow)` : "var(--shadow)",
                padding: isNarrow ? "12px 14px" : "18px 18px",
                position: "relative",
                overflow: "hidden",
                transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
                transform: isActive ? "translateY(-1px)" : "none",
                minWidth: 0,
                width: "100%",
              }}
            >
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${b.color}, transparent)` }} />
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: isNarrow ? "wrap" : "nowrap" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 900, fontSize: isNarrow ? "1.3rem" : "1.75rem", color: "var(--text)", lineHeight: 1 }}>
                    {b.count.toLocaleString()}
                  </div>
                  <div style={{ marginTop: 8, fontSize: isNarrow ? ".64rem" : ".72rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>
                    {b.label}
                  </div>
                </div>
                <div style={{ textAlign: isNarrow ? "left" : "right", marginTop: isNarrow ? 4 : 0 }}>
                  <div style={{ fontSize: isNarrow ? ".6rem" : ".68rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>
                    Duration
                  </div>
                  <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: isNarrow ? ".78rem" : ".88rem", fontWeight: 800, color: "var(--text)" }}>
                    {b.duration}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1100px" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                <th style={{ ...thStyle, textAlign: "left" }}>#</th>
                <SortHeader sortKey="driver" label="Driver" sort={speedSort} onToggle={toggleSpeedSort} thStyle={thStyle} />
                <SortHeader sortKey="vehicle" label="Vehicle" sort={speedSort} onToggle={toggleSpeedSort} thStyle={thStyle} />
                <SortHeader sortKey="initialLocation" label="Initial Location" sort={speedSort} onToggle={toggleSpeedSort} thStyle={thStyle} />
                <SortHeader sortKey="finalLocation" label="Final Location" sort={speedSort} onToggle={toggleSpeedSort} thStyle={thStyle} />
                <SortHeader sortKey="mileage" label="Mileage" sort={speedSort} onToggle={toggleSpeedSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="avgSpeed" label="Avg. speed" sort={speedSort} onToggle={toggleSpeedSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="duration" label="Duration" sort={speedSort} onToggle={toggleSpeedSort} align="right" thStyle={thStyle} />
              </tr>
            </thead>
            <tbody>
              {pagedSpeed.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "36px", color: "var(--text3)" }}>
                    No speed records found for this selection.
                  </td>
                </tr>
              ) : (
                pagedSpeed.map((r, idx) => (
                  <tr key={`${r.id}-${idx}`} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 14px", color: "var(--text3)" }}>
                      {(speedPage - 1) * SPEED_PAGE_SIZE + idx + 1}
                    </td>
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
  );
}

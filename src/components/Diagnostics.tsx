"use client";

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import type { SharedTabProps, ViolationRecord } from "../lib/data";
import { useMediaQuery } from "../lib/useMediaQuery";
import { LAYOUT_NARROW_QUERY } from "../lib/breakpoints";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver } from "../lib/driverDisplay";
import { exportEnaReportPdf, formatDateRangeLabel } from "../lib/exportEnaReportPdf";
import {
  SortHeader,
  parseDateTimeMs,
  parseDurationSeconds,
  sortRowsBy,
  useTableSort,
} from "../lib/sortableTable";
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

const DIAGNOSTIC_TYPES = [
  "Accelerator < 40 %",
  "Green Band Driving",
  "Accelerator > 70%",
  "Engine Stress",
  "Engine Temp >105°",
] as const;

function durationToSeconds(value?: string) {
  if (!value) return 0;
  const normalized = String(value).trim();
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

function parseKm(value?: string) {
  const match = String(value ?? "").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : 0;
}

function summarize(rows: ViolationRecord[], type: string) {
  const inType = rows.filter((r) => String(r.violation ?? "").trim() === type);
  const seconds = inType.reduce((sum, r) => sum + durationToSeconds(r.duration), 0);
  const km = inType.reduce((sum, r) => sum + parseKm(r.mileage), 0);
  return { duration: secondsToDuration(seconds), distanceKm: km };
}

export default function Diagnostics({
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
}: SharedTabProps) {
  const narrow = useMediaQuery(LAYOUT_NARROW_QUERY);
  const violations = useMemo(() => data?.violations ?? [], [data?.violations]);
  const drivers = useMemo(() => data?.drivers ?? [], [data?.drivers]);
  const fuelFillings = useMemo(() => data?.fuelFillings ?? [], [data?.fuelFillings]);
  const fuelDrains = useMemo(() => data?.fuelDrains ?? [], [data?.fuelDrains]);
  const extraMissingVehicles = useMemo(
    () => drivers.filter((d) => isMissingDriver(d.name)).map((d) => d.vehicle),
    [drivers],
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

  const vehicles = useMemo(
    () => [...new Set(violations.map((v) => String(v.vehicle ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [violations],
  );

  const [typeFilter, setTypeFilter] = useState<(typeof DIAGNOSTIC_TYPES)[number]>("Green Band Driving");
  const [vehicleFilter, setVehicleFilter] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    return violations.filter((v) => {
      if (!DIAGNOSTIC_TYPES.includes(v.violation as (typeof DIAGNOSTIC_TYPES)[number])) return false;
      if (vehicleFilter !== "All" && v.vehicle !== vehicleFilter) return false;
      if (typeFilter && v.violation !== typeFilter) return false;
      return true;
    });
  }, [violations, typeFilter, vehicleFilter]);

  type DiagSortKey =
    | "driver"
    | "vehicle"
    | "beginning"
    | "end"
    | "duration"
    | "distance"
    | "initialLocation"
    | "finalLocation";
  const { sort: diagSort, toggleSort: toggleDiagSort } = useTableSort<DiagSortKey>(null);

  // Build a sortable extractor once so the on-screen table and the downloads
  // sort the rows the same way.
  const sortDiagRows = useCallback(
    (rows: ViolationRecord[]) =>
      sortRowsBy(rows, diagSort, (row, key) => {
        switch (key) {
          case "driver":
            return formatDriverCell(row.vehicle, row.driver);
          case "vehicle":
            return row.vehicle;
          case "beginning":
            return parseDateTimeMs(row.beginning);
          case "end":
            return parseDateTimeMs(row.end);
          case "duration":
            return parseDurationSeconds(row.duration);
          case "distance":
            return parseKm(row.mileage);
          case "initialLocation":
            return row.initialLocation;
          case "finalLocation":
            return row.finalLocation;
          default:
            return 0;
        }
      }),
    [diagSort, formatDriverCell],
  );

  const sortedFiltered = useMemo(() => sortDiagRows(filtered), [sortDiagRows, filtered]);

  /** All five diagnostic types with their (vehicle-scoped) rows, used by the
   *  bulk PDF and XLSX downloads so each export contains a section/sheet per
   *  type regardless of which one is selected on screen. */
  const diagnosticTypesForDownload = useMemo(
    () =>
      DIAGNOSTIC_TYPES.map((type) => {
        const rowsForType = violations.filter(
          (v) =>
            v.violation === type &&
            (vehicleFilter === "All" || v.vehicle === vehicleFilter),
        );
        const rows = sortDiagRows(rowsForType);
        const totalSeconds = rows.reduce((sum, r) => sum + durationToSeconds(r.duration), 0);
        const totalKm = rows.reduce((sum, r) => sum + parseKm(r.mileage), 0);
        return {
          type,
          rows,
          count: rows.length,
          duration: secondsToDuration(totalSeconds),
          distanceKm: totalKm,
        };
      }),
    [violations, vehicleFilter, sortDiagRows],
  );

  const downloadInstancesPdf = useCallback(() => {
    const head = [[
      "#",
      "Driver",
      "Vehicle",
      "Beginning",
      "End",
      "Duration",
      "Distance (km)",
      "Initial Location",
      "Final Location",
    ]];

    const totalInstances = diagnosticTypesForDownload.reduce((sum, t) => sum + t.count, 0);
    const totalSecondsAll = diagnosticTypesForDownload.reduce(
      (sum, t) => sum + durationToSeconds(t.duration),
      0,
    );
    const scopeLabel = vehicleFilter === "All" ? "All Vehicles" : vehicleFilter;

    const sections = diagnosticTypesForDownload.map((t) => ({
      heading: `${t.type} — ${t.count.toLocaleString()} instance${t.count === 1 ? "" : "s"} · Duration ${t.duration} · ${t.distanceKm.toFixed(1)} km`,
      head,
      body:
        t.rows.length === 0
          ? [["—", `No "${t.type}" instances recorded for ${scopeLabel}.`, "", "", "", "", "", "", ""]]
          : t.rows.map((r, i) => [
              i + 1,
              formatDriverCell(r.vehicle, r.driver),
              r.vehicle,
              r.beginning,
              r.end,
              r.duration,
              parseKm(r.mileage).toFixed(1),
              r.initialLocation || "—",
              r.finalLocation || "—",
            ]),
    }));

    void exportEnaReportPdf({
      title: "Ena Fleet Diagnostics Report",
      subtitle: formatDateRangeLabel(startDate, endDate),
      summary: diagnosticTypesForDownload.map((t) => ({
        label: t.type,
        value: `${t.count.toLocaleString()} · ${t.duration}`,
      })),
      narrative:
        totalInstances === 0
          ? `No diagnostic instances were recorded for ${scopeLabel} during this period.`
          : `Diagnostics across all event types for ${scopeLabel}. ${totalInstances.toLocaleString()} total instance${totalInstances === 1 ? "" : "s"} · combined duration ${secondsToDuration(totalSecondsAll)}.`,
      sections,
      fileName: `ena_fleet_diagnostics_${makeTimestamp()}.pdf`,
      landscape: true,
    });
  }, [diagnosticTypesForDownload, formatDriverCell, vehicleFilter, startDate, endDate]);

  const downloadInstancesXlsx = useCallback(() => {
    const headers = [
      "#",
      "Driver",
      "Vehicle",
      "Beginning",
      "End",
      "Duration",
      "Distance (km)",
      "Initial Location",
      "Final Location",
    ];
    const book = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    for (const t of diagnosticTypesForDownload) {
      const aoa: (string | number)[][] = [headers];
      if (t.rows.length === 0) {
        aoa.push(["—", `No "${t.type}" instances recorded.`]);
      } else {
        t.rows.forEach((r, i) => {
          aoa.push([
            i + 1,
            formatDriverCell(r.vehicle, r.driver),
            r.vehicle,
            r.beginning,
            r.end,
            r.duration,
            parseKm(r.mileage).toFixed(1),
            r.initialLocation,
            r.finalLocation,
          ]);
        });
      }
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      // Excel sheet names: max 31 chars, no / \ ? * [ ].
      const baseName = t.type.replace(/[\\/?*[\]]/g, "-").slice(0, 31);
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

    XLSX.writeFile(book, `ena_fleet_diagnostics_${makeTimestamp()}.xlsx`);
  }, [diagnosticTypesForDownload, formatDriverCell]);

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
  const pagedRows = sortedFiltered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const cards = useMemo(() => {
    const totalDistanceKm =
      vehicleFilter === "All"
        ? drivers.reduce((sum, d) => sum + (d.distance ?? 0), 0)
        : drivers
          .filter((d) => d.vehicle === vehicleFilter)
          .reduce((sum, d) => sum + (d.distance ?? 0), 0);

    return DIAGNOSTIC_TYPES.map((type) => {
      const base = vehicleFilter === "All"
        ? violations
        : violations.filter((v) => v.vehicle === vehicleFilter);
      const { duration, distanceKm } = summarize(base, type);
      const pct = totalDistanceKm > 0 ? (distanceKm / totalDistanceKm) * 100 : 0;
      const distance = type === "Green Band Driving"
        ? `${distanceKm.toFixed(1)} km (${pct.toFixed(1)}%)`
        : `${distanceKm.toFixed(1)} km`;
      return { type, duration, distance };
    });
  }, [violations, vehicleFilter, drivers]);

  const baseCardStyle: CSSProperties = {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    overflow: "hidden",
    position: "relative",
    cursor: "pointer",
    appearance: "none",
    textAlign: "left",
    transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
    minWidth: 0,
    width: "100%",
  };

  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "auto", overflowY: "visible" }}>
      <PageHeader
        title="Fleet"
        titleAccent="Diagnostics"
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

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Vehicle
          </span>
          <select
            value={vehicleFilter}
            onChange={(e) => {
              setVehicleFilter(e.target.value);
              setCurrentPage(1);
            }}
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
              minWidth: 200,
            }}
          >
            <option value="All">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
          gap: "14px",
        }}
      >
        {cards.map((c, idx) => {
          const color = colors[idx % colors.length];
          const isActive = c.type === typeFilter;
          return (
            <button
              key={c.type}
              type="button"
              onClick={() => {
                setTypeFilter(c.type);
                setCurrentPage(1);
              }}
              aria-pressed={isActive}
              style={{
                ...baseCardStyle,
                border: isActive ? `2px solid ${color}` : "1px solid var(--border)",
                boxShadow: isActive ? `0 0 0 3px ${color}22, var(--shadow)` : "var(--shadow)",
                transform: isActive ? "translateY(-1px)" : "none",
              }}
            >
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />
              <div style={{ padding: "14px 16px 12px" }}>
                <div style={{ fontSize: ".7rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800, marginBottom: 10 }}>
                  {c.type}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.05rem", fontWeight: 900, color: "var(--text)", lineHeight: 1.15 }}>
                  {c.duration}
                </div>
                <div style={{ marginTop: 6, fontFamily: "var(--font-body)", fontSize: ".86rem", color: "var(--text2)", fontWeight: 800 }}>
                  {c.distance}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 18, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, color: "var(--text)", fontSize: ".92rem" }}>
            Instances
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
            <button
              type="button"
              onClick={downloadInstancesPdf}
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
              onClick={downloadInstancesXlsx}
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
              Download All Types (XLSX)
            </button>
            <div style={{ fontSize: ".76rem", color: "var(--text2)" }}>
              {typeFilter}{vehicleFilter !== "All" ? ` • ${vehicleFilter}` : ""} • {filtered.length} rows
            </div>
          </div>
        </div>

        <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1100px" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                {(() => {
                  const diagThStyle: CSSProperties = {
                    padding: "11px 12px",
                    fontFamily: "var(--font-body)",
                    fontSize: ".65rem",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    color: "#000000",
                    whiteSpace: "nowrap",
                  };
                  return (
                    <>
                      <th style={{ ...diagThStyle, textAlign: "left" }}>#</th>
                      <SortHeader sortKey="driver" label="Driver" sort={diagSort} onToggle={toggleDiagSort} thStyle={diagThStyle} />
                      <SortHeader sortKey="vehicle" label="Vehicle" sort={diagSort} onToggle={toggleDiagSort} thStyle={diagThStyle} />
                      <SortHeader sortKey="beginning" label="Beginning" sort={diagSort} onToggle={toggleDiagSort} thStyle={diagThStyle} />
                      <SortHeader sortKey="end" label="End" sort={diagSort} onToggle={toggleDiagSort} thStyle={diagThStyle} />
                      <SortHeader sortKey="duration" label="Duration" sort={diagSort} onToggle={toggleDiagSort} align="right" thStyle={diagThStyle} />
                      <SortHeader sortKey="distance" label="Distance (km)" sort={diagSort} onToggle={toggleDiagSort} align="right" thStyle={diagThStyle} />
                      <SortHeader sortKey="initialLocation" label="Initial Location" sort={diagSort} onToggle={toggleDiagSort} thStyle={diagThStyle} />
                      <SortHeader sortKey="finalLocation" label="Final Location" sort={diagSort} onToggle={toggleDiagSort} thStyle={diagThStyle} />
                    </>
                  );
                })()}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "36px", color: "var(--text3)" }}>
                    No records found for the selected filters.
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, idx) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", color: "var(--text3)" }}>
                      {(currentPage - 1) * pageSize + idx + 1}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{formatDriverCell(r.vehicle, r.driver)}</td>
                    <td style={{ padding: "10px 12px" }}>{r.vehicle}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text2)", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{r.beginning}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text2)", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{r.end}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{r.duration}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{parseKm(r.mileage).toFixed(1)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(r.initialLocationCoords || r.initialLocation)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {r.initialLocation}
                      </a>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(r.finalLocationCoords || r.finalLocation)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {r.finalLocation}
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: "6px 10px", fontSize: ".75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface2)", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.6 : 1 }}
          >
            Prev
          </button>
          <span style={{ fontSize: ".75rem", color: "var(--text2)", minWidth: 100, textAlign: "center" }}>
            Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{ padding: "6px 10px", fontSize: ".75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface2)", cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.6 : 1 }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}


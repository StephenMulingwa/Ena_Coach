"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  VIOLATION_TYPES,
  type Driver,
  type SharedTabProps,
  type ViolationRecord,
  type ViolationType,
} from "../lib/data";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver } from "../lib/driverDisplay";
import { exportAllViolationsWorkbook, exportMonitoringPdf, toDate } from "../lib/violationReportsExport";
import {
  SortHeader,
  parseDateTimeMs,
  parseDurationSeconds,
  parseFirstNumber,
  sortRowsBy,
  useTableSort,
} from "../lib/sortableTable";
import { useMediaQuery } from "../lib/useMediaQuery";
import { LAYOUT_NARROW_QUERY } from "../lib/breakpoints";

const VIOLATIONS_PAGE_SIZE = 10;

export default function ViolationMonitoringPanel({
  data,
  startDate,
  endDate,
}: Pick<SharedTabProps, "data" | "startDate" | "endDate">) {
  const [activeViolation, setActiveViolation] = useState<ViolationType>("Harsh Cornering");
  const [driverFilterId, setDriverFilterId] = useState<string>("ALL");
  const [vehicleFilter, setVehicleFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const isNarrow = useMediaQuery(LAYOUT_NARROW_QUERY);

  const violations = useMemo(() => data?.violations ?? [], [data?.violations]);
  const drivers = useMemo(() => data?.drivers ?? [], [data?.drivers]);
  const fuelFillings = useMemo(() => data?.fuelFillings ?? [], [data?.fuelFillings]);
  const fuelDrains = useMemo(() => data?.fuelDrains ?? [], [data?.fuelDrains]);

  const vehicleOptions = useMemo(
    () =>
      [...new Set(violations.map((v) => String(v.vehicle ?? "").trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [violations],
  );

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

  const violationMatchesDriverFilter = useCallback(
    (r: ViolationRecord, driverId: string, driversList: Driver[]) => {
      if (driverId === "ALL") return true;
      const d = driversList.find((x) => x.id === driverId);
      if (!d) return false;
      return r.driver === d.name && r.vehicle === d.vehicle;
    },
    [],
  );

  const vehicleMatches = useCallback(
    (r: ViolationRecord) =>
      vehicleFilter === "ALL" || String(r.vehicle ?? "").trim() === vehicleFilter,
    [vehicleFilter],
  );

  const driverScoped = useMemo(
    () =>
      violations
        .filter((r) => violationMatchesDriverFilter(r, driverFilterId, drivers))
        .filter(vehicleMatches),
    [violations, driverFilterId, drivers, violationMatchesDriverFilter, vehicleMatches],
  );

  const dateFiltered = useMemo(
    () => violations.filter((r) => r.violation === activeViolation),
    [violations, activeViolation],
  );
  const filtered = useMemo(
    () =>
      dateFiltered
        .filter((r) => violationMatchesDriverFilter(r, driverFilterId, drivers))
        .filter(vehicleMatches),
    [dateFiltered, driverFilterId, drivers, violationMatchesDriverFilter, vehicleMatches],
  );
  type ViolationSortKey =
    | "driver"
    | "vehicle"
    | "beginning"
    | "initialLocation"
    | "end"
    | "finalLocation"
    | "avgSpeed"
    | "maxSpeed"
    | "duration"
    | "mileage";
  // Default to newest events first, matching the previous behavior.
  const { sort: violationSort, toggleSort: toggleViolationSort } = useTableSort<ViolationSortKey>({
    key: "beginning",
    dir: "desc",
  });

  // Reused by both the on-screen `ordered` rows and the bulk per-type rows
  // gathered for the PDF / XLSX downloads, so every section is ordered the
  // same way as the table the user is looking at.
  const sortViolationRows = useCallback(
    (rows: ViolationRecord[]) =>
      sortRowsBy(rows, violationSort, (row, key) => {
        switch (key) {
          case "driver":
            return formatDriverCell(row.vehicle, row.driver);
          case "vehicle":
            return row.vehicle;
          case "beginning":
            return parseDateTimeMs(row.beginning) || toDate(row.beginning).getTime();
          case "end":
            return parseDateTimeMs(row.end) || toDate(row.end).getTime();
          case "initialLocation":
            return row.initialLocation;
          case "finalLocation":
            return row.finalLocation;
          case "avgSpeed":
            return parseFirstNumber(row.avgSpeed);
          case "maxSpeed":
            return parseFirstNumber(row.maxSpeed);
          case "duration":
            return parseDurationSeconds(row.duration);
          case "mileage":
            return parseFirstNumber(row.mileage);
          default:
            return 0;
        }
      }),
    [violationSort, formatDriverCell],
  );

  const ordered = useMemo(() => sortViolationRows(filtered), [filtered, sortViolationRows]);

  /** All violation types with their (vehicle + driver scoped) rows, used by the
   *  bulk PDF and XLSX downloads so each export contains a section / sheet per
   *  type regardless of which one is currently selected on screen. */
  const violationTypesForDownload = useMemo(
    () =>
      VIOLATION_TYPES.map((vt) => ({
        type: vt,
        rows: sortViolationRows(driverScoped.filter((r) => r.violation === vt)),
      })),
    [driverScoped, sortViolationRows],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / VIOLATIONS_PAGE_SIZE));
  const pagedRows = ordered.slice(
    (currentPage - 1) * VIOLATIONS_PAGE_SIZE,
    currentPage * VIOLATIONS_PAGE_SIZE,
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- violations table resets to page 1 when scope changes
    setCurrentPage(1);
  }, [activeViolation, driverFilterId, vehicleFilter, startDate, endDate]);

  const kpiCards = useMemo(
    () =>
      VIOLATION_TYPES.map((vt, idx) => ({
        type: vt,
        count: driverScoped.filter((v) => v.violation === vt).length,
        color: ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"][idx % 5],
      })),
    [driverScoped],
  );

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
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, color: "var(--text)", fontSize: ".92rem" }}>
          Violation Monitoring
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Vehicle</span>
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
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
            <option value="ALL">All Vehicles</option>
            {vehicleOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Driver</span>
          <select
            value={driverFilterId}
            onChange={(e) => setDriverFilterId(e.target.value)}
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
            <option value="ALL">All Drivers</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {formatDriverDisplay({
                  vehicle: d.vehicle,
                  rawDriver: d.name,
                  missingOrdinalByVehicle,
                  violations,
                })}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() =>
              exportMonitoringPdf(violationTypesForDownload, formatDriverCell, {
                startDate,
                endDate,
                vehicleScope: vehicleFilter === "ALL" ? "All Vehicles" : vehicleFilter,
                driverScope:
                  driverFilterId === "ALL"
                    ? "All Drivers"
                    : (drivers.find((d) => d.id === driverFilterId)?.name ?? "Selected Driver"),
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
            onClick={() => exportAllViolationsWorkbook(violationTypesForDownload, formatDriverCell)}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(245,179,0,0.35)",
              background: "rgba(245,179,0,0.15)",
              color: "#8a5a00",
              fontWeight: 700,
              fontSize: ".76rem",
              cursor: "pointer",
            }}
          >
            Download All Violations (Sheets)
          </button>
        </div>
      </div>

      <div
        className="violation-kpi-row"
        style={{
          display: "grid",
          gridTemplateColumns: isNarrow
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(auto-fit, minmax(210px, 1fr))",
          gap: isNarrow ? 10 : 14,
          marginBottom: 14,
        }}
      >
        {kpiCards.map((kpi) => {
          const isActive = kpi.type === activeViolation;
          return (
            <button
              key={kpi.type}
              type="button"
              onClick={() => setActiveViolation(kpi.type)}
              aria-pressed={isActive}
              style={{
                appearance: "none",
                textAlign: "left",
                cursor: "pointer",
                background: "var(--surface)",
                border: isActive
                  ? `2px solid ${kpi.color}`
                  : "1px solid var(--border)",
                borderRadius: "var(--radius)",
                boxShadow: isActive
                  ? `0 0 0 3px ${kpi.color}22, var(--shadow)`
                  : "var(--shadow)",
                padding: isNarrow ? "12px 14px" : "18px 18px",
                position: "relative",
                overflow: "hidden",
                transition: "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
                transform: isActive ? "translateY(-1px)" : "none",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: `linear-gradient(90deg, ${kpi.color}, transparent)`,
                }}
              />
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 800,
                  fontSize: isNarrow ? "1.3rem" : "1.65rem",
                  color: "var(--text)",
                  lineHeight: 1,
                }}
              >
                {kpi.count.toLocaleString()}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: isNarrow ? ".64rem" : ".72rem",
                  color: "#000000",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  fontWeight: 700,
                }}
              >
                {kpi.type}
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
                <SortHeader sortKey="driver" label="Driver" sort={violationSort} onToggle={toggleViolationSort} thStyle={thStyle} />
                <SortHeader sortKey="vehicle" label="Vehicle" sort={violationSort} onToggle={toggleViolationSort} thStyle={thStyle} />
                <SortHeader sortKey="beginning" label="Beginning" sort={violationSort} onToggle={toggleViolationSort} thStyle={thStyle} />
                <SortHeader sortKey="initialLocation" label="Initial Location" sort={violationSort} onToggle={toggleViolationSort} thStyle={thStyle} />
                <SortHeader sortKey="end" label="End" sort={violationSort} onToggle={toggleViolationSort} thStyle={thStyle} />
                <SortHeader sortKey="finalLocation" label="Final Location" sort={violationSort} onToggle={toggleViolationSort} thStyle={thStyle} />
                <SortHeader sortKey="avgSpeed" label="Value (RPM)" sort={violationSort} onToggle={toggleViolationSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="maxSpeed" label="Max Speed" sort={violationSort} onToggle={toggleViolationSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="duration" label="Duration" sort={violationSort} onToggle={toggleViolationSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="mileage" label="Mileage" sort={violationSort} onToggle={toggleViolationSort} align="right" thStyle={thStyle} />
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: "36px", color: "var(--text3)" }}>
                    No {activeViolation.toLowerCase()} records found for this range.
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, idx) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 14px", color: "var(--text3)" }}>
                      {(currentPage - 1) * VIOLATIONS_PAGE_SIZE + idx + 1}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatDriverCell(r.vehicle, r.driver)}</td>
                    <td style={{ padding: "10px 14px" }}>{r.vehicle}</td>
                    <td style={{ padding: "10px 14px", color: "var(--text2)", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{r.beginning}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(r.initialLocationCoords || r.initialLocation)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {r.initialLocation}
                      </a>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text2)", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{r.end}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <a
                        href={`https://www.google.com/maps?q=${encodeURIComponent(r.finalLocationCoords || r.finalLocation)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {r.finalLocation}
                      </a>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>{r.avgSpeed}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>{r.maxSpeed}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{r.duration}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>{r.mileage}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: "6px 10px", fontSize: ".75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface2)", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.6 : 1 }}
          >
            Prev
          </button>
          <span style={{ fontSize: ".75rem", color: "var(--text2)", minWidth: 80, textAlign: "center" }}>
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
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

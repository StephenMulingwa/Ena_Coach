"use client";

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import type { SharedTabProps, ViolationRecord } from "../lib/data";
import { useMediaQuery } from "../lib/useMediaQuery";
import { LAYOUT_NARROW_QUERY } from "../lib/breakpoints";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver } from "../lib/driverDisplay";
import { downloadPdfTable } from "../lib/exportPdfTable";
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
    const body = filtered.map((r, i) => [
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
    downloadPdfTable({
      title: `Diagnostics — ${typeFilter}${vehicleFilter !== "All" ? ` (${vehicleFilter})` : ""}`,
      head,
      body,
      fileName: `diagnostics_instances_${makeTimestamp()}.pdf`,
      landscape: true,
    });
  }, [filtered, formatDriverCell, typeFilter, vehicleFilter]);

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
    const aoa: (string | number)[][] = [headers];
    filtered.forEach((r, i) => {
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
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Instances");
    XLSX.writeFile(book, `diagnostics_instances_${makeTimestamp()}.xlsx`);
  }, [filtered, formatDriverCell]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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

  const cardStyle: CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
    overflow: "hidden",
    position: "relative",
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
            Type
          </span>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as (typeof DIAGNOSTIC_TYPES)[number]);
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
              minWidth: 220,
            }}
          >
            {DIAGNOSTIC_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

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
        {cards.map((c, idx) => (
          <div key={c.type} style={cardStyle}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${colors[idx % colors.length]}, transparent)` }} />
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
          </div>
        ))}
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
              Download XLSX
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
                {["#", "Driver", "Vehicle", "Beginning", "End", "Duration", "Distance (km)", "Initial Location", "Final Location"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "11px 12px",
                      textAlign: ["Duration", "Distance (km)"].includes(h) ? "right" : "left",
                      fontFamily: "var(--font-body)",
                      fontSize: ".65rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      color: "#000000",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
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


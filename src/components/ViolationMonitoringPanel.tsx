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

const VIOLATIONS_PAGE_SIZE = 10;

export default function ViolationMonitoringPanel({
  data,
  startDate,
  endDate,
}: Pick<SharedTabProps, "data" | "startDate" | "endDate">) {
  const [activeViolation, setActiveViolation] = useState<ViolationType>("Harsh Cornering");
  const [driverFilterId, setDriverFilterId] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);

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

  const violationMatchesDriverFilter = useCallback(
    (r: ViolationRecord, driverId: string, driversList: Driver[]) => {
      if (driverId === "ALL") return true;
      const d = driversList.find((x) => x.id === driverId);
      if (!d) return false;
      return r.driver === d.name && r.vehicle === d.vehicle;
    },
    [],
  );

  const driverScoped = useMemo(
    () => violations.filter((r) => violationMatchesDriverFilter(r, driverFilterId, drivers)),
    [violations, driverFilterId, drivers, violationMatchesDriverFilter],
  );

  const dateFiltered = useMemo(
    () => violations.filter((r) => r.violation === activeViolation),
    [violations, activeViolation],
  );
  const filtered = useMemo(
    () => dateFiltered.filter((r) => violationMatchesDriverFilter(r, driverFilterId, drivers)),
    [dateFiltered, driverFilterId, drivers, violationMatchesDriverFilter],
  );
  const ordered = useMemo(
    () =>
      filtered
        .slice()
        .sort((a, b) => toDate(b.beginning).getTime() - toDate(a.beginning).getTime()),
    [filtered],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / VIOLATIONS_PAGE_SIZE));
  const pagedRows = ordered.slice(
    (currentPage - 1) * VIOLATIONS_PAGE_SIZE,
    currentPage * VIOLATIONS_PAGE_SIZE,
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- violations table resets to page 1 when scope changes
    setCurrentPage(1);
  }, [activeViolation, driverFilterId, startDate, endDate]);

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
          <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Violation Type</span>
          <select
            value={activeViolation}
            onChange={(e) => {
              setActiveViolation(e.target.value as ViolationType);
              setDriverFilterId("ALL");
            }}
            style={{
              padding: "6px 10px",
              background: "#fffdf3",
              border: "2px solid rgba(245,179,0,0.45)",
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
            {VIOLATION_TYPES.map((vt) => (
              <option key={vt} value={vt}>{vt}</option>
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
            onClick={() => exportMonitoringPdf(ordered, formatDriverCell)}
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
            onClick={() => exportAllViolationsWorkbook(startDate, endDate, violations, formatDriverCell)}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px", marginBottom: "14px" }}>
        {kpiCards.map((kpi) => (
          <div key={kpi.type} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", padding: "18px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${kpi.color}, transparent)` }} />
            <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, fontSize: "1.65rem", color: "var(--text)", lineHeight: 1 }}>
              {kpi.count.toLocaleString()}
            </div>
            <div style={{ marginTop: 8, fontSize: ".72rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
              {kpi.type}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1100px" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                {["#", "Driver", "Vehicle", "Beginning", "Initial Location", "End", "Final Location", "Value (RPM)", "Max Speed", "Duration", "Mileage"].map((h) => (
                  <th key={h} style={{ ...thStyle, textAlign: ["Value (RPM)", "Max Speed", "Duration", "Mileage"].includes(h) ? "right" : "left" }}>{h}</th>
                ))}
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

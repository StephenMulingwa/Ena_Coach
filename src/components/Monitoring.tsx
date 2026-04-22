"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import {
  VIOLATION_TYPES,
  type SharedTabProps,
  type ViolationType,
} from "../lib/data";
import type { ViolationRecord } from "../lib/data";
import * as XLSX from "xlsx";
import { aliasDriverName, buildDriverAliasMap } from "../lib/driverAlias";

const MONITORING_PAGE_SIZE = 10;

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

function escapeExcelString(value: string) {
  return String(value ?? "").replaceAll('"', '""');
}

function mapsHyperlinkFormula(label: string, query: string) {
  const safeLabel = escapeExcelString(label);
  const safeQuery = String(query ?? "").trim();
  if (!safeQuery || safeQuery === "-----" || safeQuery === "—") return safeLabel;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeQuery)}`;
  return `HYPERLINK("${escapeExcelString(url)}","${safeLabel}")`;
}

function toDate(value: string) {
  const [datePart] = value.split(" ");
  const [dd, mm, yyyy] = datePart.split(".").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function exportMonitoringCSV(rows: ViolationRecord[], getAlias: (name: string) => string) {
  const cols = [
    "Driver",
    "Vehicle",
    "Violation",
    "Beginning",
    "Initial location",
    "End",
    "Final location",
    "Avg. speed",
    "Max. speed",
    "Duration",
    "Mileage",
  ];
  const header = cols.join(",");
  const body = rows
    .map((r) =>
      [
        getAlias(r.driver),
        r.vehicle,
        r.violation,
        r.beginning,
        r.initialLocation,
        r.end,
        r.finalLocation,
        r.avgSpeed,
        r.maxSpeed,
        r.duration,
        r.mileage,
      ]
        .map((v) => `"${String(v).replaceAll("\"", "\"\"")}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `violations_filtered_${makeTimestamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function toSheetRows(rows: ViolationRecord[], getAlias: (name: string) => string) {
  return rows.map((r) => ({
    Driver: getAlias(r.driver),
    Vehicle: r.vehicle,
    Violation: r.violation,
    Beginning: r.beginning,
    "Initial location": r.initialLocation,
    End: r.end,
    "Final location": r.finalLocation,
    "Avg. speed": r.avgSpeed,
    "Max. speed": r.maxSpeed,
    Duration: r.duration,
    Mileage: r.mileage,
  }));
}

function exportAllViolationsWorkbook(
  start: string,
  end: string,
  violations: ViolationRecord[],
  getAlias: (name: string) => string,
) {
  const workbook = XLSX.utils.book_new();
  const s = new Date(start);
  const e = new Date(end);
  e.setHours(23, 59, 59, 999);

  for (const violationType of VIOLATION_TYPES) {
    const rows = violations.filter((r) => {
      const d = toDate(r.beginning);
      return d >= s && d <= e && r.violation === violationType;
    });
    const headers = [
      "Driver",
      "Vehicle",
      "Violation",
      "Beginning",
      "Initial location",
      "End",
      "Final location",
      "Avg. speed",
      "Max. speed",
      "Duration",
      "Mileage",
    ];
    const aoa: XLSX.CellObject[][] = [];
    aoa.push(headers.map((h) => ({ t: "s", v: h })));
    for (const r of rows) {
      const initialLabel = String(r.initialLocation ?? "");
      const finalLabel = String(r.finalLocation ?? "");
      const initialQuery = String(r.initialLocationCoords || r.initialLocation || "");
      const finalQuery = String(r.finalLocationCoords || r.finalLocation || "");
      const initialUrl = initialQuery.trim()
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(initialQuery)}`
        : "";
      const finalUrl = finalQuery.trim()
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(finalQuery)}`
        : "";
      aoa.push([
        { t: "s", v: String(getAlias(r.driver) ?? "") },
        { t: "s", v: String(r.vehicle ?? "") },
        { t: "s", v: String(r.violation ?? "") },
        { t: "s", v: String(r.beginning ?? "") },
        initialUrl ? { t: "s", v: initialLabel, l: { Target: initialUrl } } : { t: "s", v: initialLabel },
        { t: "s", v: String(r.end ?? "") },
        finalUrl ? { t: "s", v: finalLabel, l: { Target: finalUrl } } : { t: "s", v: finalLabel },
        { t: "s", v: String(r.avgSpeed ?? "") },
        { t: "s", v: String(r.maxSpeed ?? "") },
        { t: "s", v: String(r.duration ?? "") },
        { t: "s", v: String(r.mileage ?? "") },
      ]);
    }
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(workbook, worksheet, violationType.slice(0, 31));
  }

  XLSX.writeFile(workbook, `violations_all_sheets_${makeTimestamp()}.xlsx`);
}

export default function Monitoring({
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
}: SharedTabProps) {
  const [activeViolation, setActiveViolation] = useState<ViolationType>("Harsh Cornering");
  const [driverFilter, setDriverFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const records = data?.violations ?? [];
  const drivers = data?.drivers ?? [];
  const driverAliasMap = useMemo(
    () => buildDriverAliasMap([...drivers.map((d) => d.name), ...records.map((r) => r.driver)]),
    [drivers, records],
  );
  const getAlias = (name: string) => aliasDriverName(name, driverAliasMap);

  const dateFiltered = useMemo(
    () => records.filter((r) => r.violation === activeViolation),
    [records, activeViolation],
  );

  const filtered =
    driverFilter === "All"
      ? dateFiltered
      : dateFiltered.filter((r) => r.driver === driverFilter);

  const ordered = useMemo(
    () =>
      filtered
        .slice()
        .sort((a, b) => toDate(b.beginning).getTime() - toDate(a.beginning).getTime()),
    [filtered],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / MONITORING_PAGE_SIZE));
  const pagedRows = ordered.slice(
    (currentPage - 1) * MONITORING_PAGE_SIZE,
    currentPage * MONITORING_PAGE_SIZE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeViolation, driverFilter, startDate, endDate]);

  const selectStyle: React.CSSProperties = {
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
  };

  const thStyle: React.CSSProperties = {
    padding: "11px 14px",
    textAlign: "left",
    fontFamily: "var(--font-body)",
    fontSize: ".7rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".07em",
    color: "#000000",
    whiteSpace: "nowrap",
  };

  return (
    <div>
      <PageHeader
        title="Violation"
        titleAccent="Monitoring"
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

      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Violation Type</span>
          <select
            value={activeViolation}
            onChange={(e) => {
              setActiveViolation(e.target.value as ViolationType);
              setDriverFilter("All");
            }}
            style={{ ...selectStyle, border: "2px solid rgba(245,179,0,0.45)", background: "#fffdf3" }}
          >
            {VIOLATION_TYPES.map((vt) => (
              <option key={vt} value={vt}>{vt}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Driver</span>
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} style={selectStyle}>
            <option value="All">All Drivers</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.name}>{getAlias(d.name)}</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => exportMonitoringCSV(ordered, getAlias)}
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
            Download Filtered Violation
          </button>
          <button
            onClick={() => exportAllViolationsWorkbook(startDate, endDate, records, getAlias)}
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

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1100px" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                {["#", "Driver", "Vehicle", "Beginning", "Initial Location", "End", "Final Location", "Avg Speed", "Max Speed", "Duration", "Mileage"].map((h) => (
                  <th key={h} style={{ ...thStyle, textAlign: ["Avg Speed", "Max Speed", "Duration", "Mileage"].includes(h) ? "right" : "left" }}>{h}</th>
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
                      {(currentPage - 1) * MONITORING_PAGE_SIZE + idx + 1}
                    </td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{getAlias(r.driver)}</td>
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


"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import {
  VIOLATION_TYPES,
  type SharedTabProps,
} from "../lib/data";
import type { ViolationRecord } from "../lib/data";
import * as XLSX from "xlsx";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver, missingDriverFilterValue, parseMissingDriverFilterValue } from "../lib/driverDisplay";

const MONITORING_PAGE_SIZE = 10;
const MONITORING_DRIVER_SEP = "\x1f";

function monitoringDriverKey(vehicle: string, rawDriver: string) {
  return `${String(vehicle ?? "").trim()}${MONITORING_DRIVER_SEP}${String(rawDriver ?? "").trim()}`;
}

function parseMonitoringDriverKey(key: string): { vehicle: string; rawDriver: string } | null {
  const i = key.indexOf(MONITORING_DRIVER_SEP);
  if (i < 0) return null;
  return { vehicle: key.slice(0, i), rawDriver: key.slice(i + MONITORING_DRIVER_SEP.length) };
}

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

function toDate(value: string) {
  const [datePart] = value.split(" ");
  const [dd, mm, yyyy] = datePart.split(".").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function gradeFor(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

const VIOLATION_WEIGHTS: Record<string, number> = {
  "Over Speeding": 2.0,
  "Harsh Braking": 1.6,
  "Harsh Cornering": 1.3,
  "Over Revving": 1.1,
  "Free Wheeling": 0.8,
};

function computeDriverScore(args: {
  distanceKm: number;
  counts: Record<string, number>;
}) {
  const distance = Math.max(0, args.distanceKm || 0);
  const base = 100;
  const denom = Math.max(1, distance);

  // Penalty is based on violations per 100 km, weighted by severity.
  // Tuned so that 1 "Over Speeding" per 100km costs ~16 points.
  const per100 = (count: number) => (count / denom) * 100;
  const penalty = VIOLATION_TYPES.reduce((sum, vt) => {
    const c = args.counts[vt] ?? 0;
    const w = VIOLATION_WEIGHTS[vt] ?? 1;
    return sum + (per100(c) * w * 8);
  }, 0);

  const score = clamp(base - penalty, 0, 100);
  return { score, grade: gradeFor(score), penalty };
}

function exportMonitoringCSV(rows: ViolationRecord[], formatDriverCell: (vehicle: string, rawDriver: string) => string) {
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
        formatDriverCell(r.vehicle, r.driver),
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

function exportAllViolationsWorkbook(
  start: string,
  end: string,
  violations: ViolationRecord[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
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
        { t: "s", v: String(formatDriverCell(r.vehicle, r.driver) ?? "") },
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
  const [driverFilter, setDriverFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const records = useMemo(() => data?.violations ?? [], [data?.violations]);
  const drivers = useMemo(() => data?.drivers ?? [], [data?.drivers]);

  const extraMissingVehicles = useMemo(
    () => drivers.filter((d) => isMissingDriver(d.name)).map((d) => d.vehicle),
    [drivers],
  );

  const missingOrdinalByVehicle = useMemo(
    () => buildVehicleMissingOrdinalMap(records, [], [], extraMissingVehicles),
    [records, extraMissingVehicles],
  );

  const formatDriverCell = useCallback(
    (vehicle: string, rawDriver: string) =>
      formatDriverDisplay({
        vehicle,
        rawDriver,
        missingOrdinalByVehicle,
        violations: records,
      }),
    [missingOrdinalByVehicle, records],
  );

  const driverOptions = useMemo(() => {
    const byValue = new Map<string, { label: string; vehicle: string }>();
    for (const d of drivers) {
      const v = String(d.vehicle ?? "").trim();
      const raw = String(d.name ?? "").trim();
      if (!v && !raw) continue;
      const value = isMissingDriver(raw) ? missingDriverFilterValue(v) : monitoringDriverKey(v, raw);
      const label = formatDriverCell(v, raw);
      byValue.set(value, { label, vehicle: v });
    }
    // Also include any driver+vehicle combinations present in violations (covers cases where drivers[] is incomplete).
    for (const r of records) {
      const v = String(r.vehicle ?? "").trim();
      const raw = String(r.driver ?? "").trim();
      if (!v && !raw) continue;
      const value = isMissingDriver(raw) ? missingDriverFilterValue(v) : monitoringDriverKey(v, raw);
      const label = formatDriverCell(v, raw);
      byValue.set(value, { label, vehicle: v });
    }
    return [...byValue.entries()]
      .map(([value, meta]) => ({ value, label: meta.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [drivers, records, formatDriverCell]);

  const filteredRecords = useMemo(() => {
    if (driverFilter === "ALL") return records;
    const missVeh = parseMissingDriverFilterValue(driverFilter);
    if (missVeh) {
      return records.filter((r) => String(r.vehicle ?? "").trim() === missVeh && isMissingDriver(r.driver));
    }
    const parsed = parseMonitoringDriverKey(driverFilter);
    if (!parsed) return records;
    return records.filter(
      (r) =>
        String(r.vehicle ?? "").trim() === parsed.vehicle
        && String(r.driver ?? "").trim() === parsed.rawDriver,
    );
  }, [driverFilter, records]);

  const ordered = useMemo(
    () =>
      filteredRecords
        .slice()
        .sort((a, b) => toDate(b.beginning).getTime() - toDate(a.beginning).getTime()),
    [filteredRecords],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pagination returns to page 1 when filters/dates change
    setCurrentPage(1);
  }, [driverFilter, startDate, endDate]);

  const driverScores = useMemo(() => {
    const distanceByDriverKey = new Map<string, number>();
    const vehicleByDriverKey = new Map<string, string>();
    for (const d of drivers) {
      const key = isMissingDriver(d.name) ? missingDriverFilterValue(d.vehicle) : monitoringDriverKey(d.vehicle, d.name);
      distanceByDriverKey.set(key, Number(d.distance ?? 0));
      vehicleByDriverKey.set(key, d.vehicle);
    }

    const countsByDriverKey = new Map<string, Record<string, number>>();
    for (const r of filteredRecords) {
      const key = isMissingDriver(r.driver) ? missingDriverFilterValue(r.vehicle) : monitoringDriverKey(r.vehicle, r.driver);
      const current = countsByDriverKey.get(key) ?? {};
      current[r.violation] = (current[r.violation] ?? 0) + 1;
      countsByDriverKey.set(key, current);
    }

    const uniqueKeys = new Set<string>();
    for (const r of filteredRecords) {
      uniqueKeys.add(isMissingDriver(r.driver) ? missingDriverFilterValue(r.vehicle) : monitoringDriverKey(r.vehicle, r.driver));
    }

    const rows = Array.from(uniqueKeys).map((key) => {
      const parsed = parseMissingDriverFilterValue(key) ? { vehicle: parseMissingDriverFilterValue(key)!, rawDriver: "Missing" } : parseMonitoringDriverKey(key);
      const vehicle = parsed?.vehicle ?? "—";
      const rawDriver = parsed?.rawDriver ?? "Missing";
      const counts = countsByDriverKey.get(key) ?? {};
      const distanceKm = distanceByDriverKey.get(key) ?? 0;
      const total = VIOLATION_TYPES.reduce((sum, vt) => sum + (counts[vt] ?? 0), 0);
      const { score, grade } = computeDriverScore({ distanceKm, counts });
      const per100 = (count: number) => (count / Math.max(1, distanceKm || 0)) * 100;
      return {
        key,
        driverLabel: formatDriverCell(vehicle, rawDriver),
        vehicle: vehicleByDriverKey.get(key) ?? vehicle,
        distanceKm,
        total,
        score,
        grade,
        counts,
        rates: Object.fromEntries(VIOLATION_TYPES.map((vt) => [vt, per100(counts[vt] ?? 0)])) as Record<string, number>,
      };
    });

    return rows.sort((a, b) => b.score - a.score || b.distanceKm - a.distanceKm);
  }, [drivers, filteredRecords, formatDriverCell]);

  const totalPages = Math.max(1, Math.ceil(driverScores.length / MONITORING_PAGE_SIZE));

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
          <span style={{ fontSize: ".66rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Driver</span>
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} style={selectStyle}>
            <option value="ALL">All Drivers</option>
            {driverOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => exportMonitoringCSV(ordered, formatDriverCell)}
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
            onClick={() => exportAllViolationsWorkbook(startDate, endDate, records, formatDriverCell)}
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
        <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1300px" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                {[
                  "#",
                  "Driver",
                  "Vehicle",
                  "Distance (km)",
                  "Score",
                  "Grade",
                  "Total Violations",
                  ...VIOLATION_TYPES.map((v) => `${v} (#/100km)`),
                ].map((h) => (
                  <th key={h} style={{ ...thStyle, textAlign: h.includes("(km)") || h.includes("Score") || h.includes("Total") || h.includes("#/100") ? "right" : "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {driverScores.length === 0 ? (
                <tr>
                  <td colSpan={7 + VIOLATION_TYPES.length} style={{ textAlign: "center", padding: "36px", color: "var(--text3)" }}>
                    No driver scoring data available for this range.
                  </td>
                </tr>
              ) : (
                driverScores
                  .slice((currentPage - 1) * MONITORING_PAGE_SIZE, currentPage * MONITORING_PAGE_SIZE)
                  .map((r, idx) => (
                    <tr key={r.key} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 14px", color: "var(--text3)" }}>
                        {(currentPage - 1) * MONITORING_PAGE_SIZE + idx + 1}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.driverLabel}</td>
                      <td style={{ padding: "10px 14px" }}>{r.vehicle}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{Number(r.distanceKm ?? 0).toFixed(0)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800, color: r.score >= 85 ? "var(--green)" : r.score >= 70 ? "#8a5a00" : "var(--red)" }}>
                        {r.score.toFixed(0)}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "left", fontWeight: 800 }}>{r.grade}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>{r.total}</td>
                      {VIOLATION_TYPES.map((vt) => {
                        const c = r.counts[vt] ?? 0;
                        const rate = r.rates[vt] ?? 0;
                        return (
                          <td key={vt} style={{ padding: "10px 14px", textAlign: "right" }}>
                            {c} ({rate.toFixed(2)})
                          </td>
                        );
                      })}
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


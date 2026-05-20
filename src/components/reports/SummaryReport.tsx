"use client";

import { useCallback, useMemo, type CSSProperties } from "react";
import PageHeader from "../PageHeader";
import DateFilter from "../DateFilter";
import { type FinalReportRow, type SharedTabProps } from "../../lib/data";
import * as XLSX from "xlsx";
import {
  buildVehicleMissingOrdinalMap,
  formatDriverDisplay,
  isMissingDriver,
} from "../../lib/driverDisplay";
import { makeTimestamp } from "../../lib/violationReportsExport";
import {
  SortHeader,
  parseDurationSeconds,
  parseFirstNumber,
  sortRowsBy,
  useTableSort,
} from "../../lib/sortableTable";
import { exportEnaReportPdf, formatDateRangeLabel } from "../../lib/exportEnaReportPdf";

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

type SummaryRow = FinalReportRow & {
  totalFuelFilled: number;
  fuelFillsCount: number;
  totalFuelDrained: number;
  fuelDrainsCount: number;
};

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

function downloadXlsx(rows: SummaryRow[], formatDriverCell: (vehicle: string, rawDriver: string) => string) {
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
  XLSX.utils.book_append_sheet(book, sheet, "Fleet Summary");
  XLSX.writeFile(book, `ena_fleet_summary_${makeTimestamp()}.xlsx`);
}

function downloadSummaryPdf(
  rows: SummaryRow[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
  startDate: string,
  endDate: string,
) {
  const head = [["#", ...columns.map((c) => c.label)]];
  const body = rows.map((row, idx) => {
    const cells: (string | number)[] = [idx + 1];
    for (const c of columns) {
      const val = row[c.key as keyof typeof row];
      if (val === null || val === undefined) {
        cells.push("—");
      } else if (c.key === "driver") {
        cells.push(formatDriverCell(String(row.vehicle ?? ""), String(row.driver ?? "")));
      } else if (typeof val === "number") {
        cells.push(c.key === "distanceKm" || c.key === "fuelConsumptionDiesel" ? val.toFixed(0) : val.toFixed(2));
      } else {
        cells.push(String(val));
      }
    }
    return cells;
  });

  const totalDistance = rows.reduce((sum, r) => sum + (Number(r.distanceKm) || 0), 0);
  const totalFuel = rows.reduce((sum, r) => sum + (Number(r.fuelConsumptionDiesel) || 0), 0);
  const totalFilled = rows.reduce((sum, r) => sum + (Number(r.totalFuelFilled) || 0), 0);
  const totalDrained = rows.reduce((sum, r) => sum + (Number(r.totalFuelDrained) || 0), 0);

  void exportEnaReportPdf({
    title: "Ena Fleet Summary Report",
    subtitle: formatDateRangeLabel(startDate, endDate),
    summary: [
      { label: "Vehicles", value: rows.length.toLocaleString() },
      { label: "Total Distance", value: `${totalDistance.toFixed(0)} km` },
      { label: "Fuel Consumed", value: `${totalFuel.toFixed(2)} L` },
      {
        label: "Filled / Drained",
        value: `${totalFilled.toFixed(2)} L · ${totalDrained.toFixed(2)} L`,
        segments: [
          { text: `${totalFilled.toFixed(2)} L`, color: "#15803d" },
          { text: " · ", color: "#475569" },
          { text: `${totalDrained.toFixed(2)} L`, color: "#b91c1c" },
        ],
      },
    ],
    narrative:
      rows.length === 0
        ? "No summary records were found for this period."
        : `Fleet activity summary across ${rows.length} vehicle${rows.length === 1 ? "" : "s"}. Aggregated distance ${totalDistance.toFixed(0)} km, diesel consumption ${totalFuel.toFixed(2)} L, refills ${totalFilled.toFixed(2)} L and drains ${totalDrained.toFixed(2)} L.`,
    sections: [{ heading: "Per-vehicle Summary", head, body }],
    fileName: `ena_fleet_summary_${makeTimestamp()}.pdf`,
    landscape: true,
  });
}

export default function SummaryReport({
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
}: SharedTabProps) {
  const rows = useMemo<SummaryRow[]>(() => {
    const finalReport = data?.finalReport ?? [];
    const drivers = data?.drivers ?? [];
    const keyFor = (driver: string, vehicle: string) => `${driver}|||${vehicle}`;
    const driverSummaryByKey = new Map(
      drivers.map((driver) => [keyFor(driver.name, driver.vehicle), driver]),
    );

    return finalReport.map((row) => {
      const summary = driverSummaryByKey.get(keyFor(row.driver, row.vehicle));
      const engineSeconds = durationToSeconds(row.engineRunningTime);
      const idlingSeconds = durationToSeconds(row.idlingEngineTime || row.engineRunningTimeIdling || "00:00:00");
      const idlingPercent = engineSeconds > 0 ? (idlingSeconds / engineSeconds) * 100 : 0;
      return {
        ...row,
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

  type SummarySortKey = (typeof columns)[number]["key"];
  const { sort: summarySort, toggleSort: toggleSummarySort } = useTableSort<SummarySortKey>(null);
  const durationKeys = useMemo(
    () => new Set<SummarySortKey>(["engineRunningTime", "idlingEngineTime"]),
    [],
  );
  const sortedRows = useMemo(
    () =>
      sortRowsBy(rows, summarySort, (row, key) => {
        if (key === "driver") return formatDriverCell(String(row.vehicle ?? ""), String(row.driver ?? ""));
        if (key === "vehicle") return String(row.vehicle ?? "");
        if (durationKeys.has(key)) {
          return parseDurationSeconds(row[key as keyof typeof row] as string);
        }
        const value = row[key as keyof typeof row];
        if (typeof value === "number") return value;
        return parseFirstNumber(value as string | number | null | undefined);
      }),
    [rows, summarySort, durationKeys, formatDriverCell],
  );

  const zeroDecimalKeys = new Set(["distanceKm", "fuelConsumptionDiesel"]);

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
        titleAccent="Summary"
        subtitle="Trip summary statistics aggregated per vehicle"
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
            <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => downloadSummaryPdf(sortedRows, formatDriverCell, startDate, endDate)}
                style={{
                  padding: "8px 14px",
                  background: "rgba(220,38,38,0.1)",
                  border: "1px solid rgba(220,38,38,0.35)",
                  borderRadius: "var(--radius-sm)",
                  color: "#b91c1c",
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => downloadXlsx(sortedRows, formatDriverCell)}
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
                {columns.map((c) => {
                  const isNumeric = c.key !== "driver" && c.key !== "vehicle" && !durationKeys.has(c.key);
                  return (
                    <SortHeader
                      key={c.key}
                      sortKey={c.key}
                      label={c.label}
                      sort={summarySort}
                      onToggle={toggleSummarySort}
                      align={isNumeric ? "right" : "left"}
                      thStyle={thStyle}
                    />
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} style={{ textAlign: "center", padding: "36px", color: "var(--text3)" }}>
                    No summary records found for this period.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", color: "var(--text3)" }}>{idx + 1}</td>
                    {columns.map((c) => {
                      const val = row[c.key as keyof typeof row];
                      if (val === null || val === undefined) {
                        return <td key={c.key} style={{ padding: "10px 12px" }}><span style={{ color: "var(--text3)" }}>—</span></td>;
                      }
                      const displayValue = typeof val === "number" && zeroDecimalKeys.has(c.key)
                        ? val.toFixed(0)
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

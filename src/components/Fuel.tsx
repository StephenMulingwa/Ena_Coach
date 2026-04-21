"use client";

import { useMemo, useState } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import type { FuelRecord, SharedTabProps } from "../lib/data";
import * as XLSX from "xlsx";
import { aliasDriverName, buildDriverAliasMap } from "../lib/driverAlias";

function getValue(record: FuelRecord, keys: string[]) {
  const entries = Object.entries(record.columns ?? {});
  for (const key of keys) {
    const found = entries.find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (found) return found[1];
  }
  return "";
}

const MAX_FUEL_ROWS = 10;

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

function parseNumeric(value: string) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function downloadTableXlsx(baseName: string, headers: string[], rows: Array<Array<string | number>>, sheetName: string) {
  const jsonRows = rows.map((row) =>
    headers.reduce<Record<string, string | number>>((acc, header, idx) => {
      acc[header] = row[idx] ?? "";
      return acc;
    }, {}),
  );
  const sheet = XLSX.utils.json_to_sheet(jsonRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, `${baseName}_${makeTimestamp()}.xlsx`);
}

function downloadFuelWorkbook(
  fillingsRows: Array<Array<string | number>>,
  drainRows: Array<Array<string | number>>,
) {
  const book = XLSX.utils.book_new();
  const fillingsHeaders = ["#", "Vehicle", "Driver", "Filling date", "Location", "Initial fuel level", "Final fuel level", "Fuel Filled"];
  const drainsHeaders = ["#", "Vehicle", "Driver", "Drain time", "Location", "Initial fuel level", "Final fuel level", "Fuel Drained"];

  const fillingsSheetRows = fillingsRows.map((row) =>
    fillingsHeaders.reduce<Record<string, string | number>>((acc, header, idx) => {
      acc[header] = row[idx] ?? "";
      return acc;
    }, {}),
  );
  const drainsSheetRows = drainRows.map((row) =>
    drainsHeaders.reduce<Record<string, string | number>>((acc, header, idx) => {
      acc[header] = row[idx] ?? "";
      return acc;
    }, {}),
  );

  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(fillingsSheetRows), "Fuel Fillings");
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(drainsSheetRows), "Fuel Drains");
  XLSX.writeFile(book, `fuel_operations_${makeTimestamp()}.xlsx`);
}

function FuelFillingsTable({
  rows,
  page,
  totalRows,
  allRows,
  totalFilled,
  onDownloadXlsx,
  getDriverAlias,
  onPrev,
  onNext,
}: {
  rows: FuelRecord[];
  page: number;
  totalRows: number;
  allRows: FuelRecord[];
  totalFilled: number;
  onDownloadXlsx: () => void;
  getDriverAlias: (name: string) => string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / MAX_FUEL_ROWS));
  const currentPage = page + 1;
  const thStyle: React.CSSProperties = {
    padding: "11px 12px",
    textAlign: "left",
    fontFamily: "var(--font-body)",
    fontSize: ".66rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".05em",
    color: "#000000",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--text)" }}>
        Fuel Fillings <span style={{ color: "#15803d", fontWeight: 800 }}>({allRows.length} fills | {totalFilled.toFixed(2)} L total)</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1250px" }}>
          <thead>
            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
              {[
                "#",
                "Vehicle",
                "Driver",
                "Filling date",
                "Location",
                "Initial fuel level",
                "Final fuel level",
                "Fuel Filled",
              ].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "var(--text3)" }}>
                  No records available for this period.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px" }}>{idx + 1}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{row.vehicle || row.grouping}</td>
                  <td style={{ padding: "10px 12px" }}>{getDriverAlias(getValue(row, ["Driver"]) || row.driver || "")}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>
                    {getValue(row, ["Filling or charge time"])}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(row.locationCoords || row.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {row.location || "—"}
                    </a>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{getValue(row, ["Initial fuel level"]) || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{getValue(row, ["Final fuel level"]) || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{getValue(row, ["Filled"]) || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onDownloadXlsx}
            style={{
              padding: "6px 10px",
              fontSize: ".75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(22,163,74,0.35)",
              background: "rgba(22,163,74,0.1)",
              color: "#15803d",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Download XLSX
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onPrev}
          disabled={currentPage === 1}
          style={{
            padding: "6px 10px",
            fontSize: ".75rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            cursor: currentPage === 1 ? "not-allowed" : "pointer",
            opacity: currentPage === 1 ? 0.6 : 1,
          }}
        >
          Prev
        </button>
        <span style={{ fontSize: ".75rem", color: "var(--text2)", minWidth: 80, textAlign: "center" }}>
          Page {currentPage} / {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={currentPage === totalPages}
          style={{
            padding: "6px 10px",
            fontSize: ".75rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            cursor: currentPage === totalPages ? "not-allowed" : "pointer",
            opacity: currentPage === totalPages ? 0.6 : 1,
          }}
        >
          Next
        </button>
        </div>
      </div>
    </div>
  );
}

function FuelDrainsTable({
  rows,
  page,
  totalRows,
  allRows,
  totalDrained,
  onDownloadXlsx,
  getDriverAlias,
  onPrev,
  onNext,
}: {
  rows: FuelRecord[];
  page: number;
  totalRows: number;
  allRows: FuelRecord[];
  totalDrained: number;
  onDownloadXlsx: () => void;
  getDriverAlias: (name: string) => string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / MAX_FUEL_ROWS));
  const currentPage = page + 1;
  const thStyle: React.CSSProperties = {
    padding: "11px 12px",
    textAlign: "left",
    fontFamily: "var(--font-body)",
    fontSize: ".66rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: ".05em",
    color: "#000000",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--text)" }}>
        Fuel Drains <span style={{ color: "var(--red)", fontWeight: 800 }}>({allRows.length} drains | {totalDrained.toFixed(2)} L total)</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1200px" }}>
          <thead>
            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
              {["#", "Vehicle", "Driver", "Drain time", "Location", "Initial fuel level", "Final fuel level", "Fuel Drained"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "30px", color: "var(--text3)" }}>
                  No records available for this period.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px" }}>{idx + 1}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{row.vehicle || row.grouping}</td>
                  <td style={{ padding: "10px 12px" }}>{getDriverAlias(getValue(row, ["Driver"]) || row.driver || "")}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{getValue(row, ["Drain time"]) || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(row.locationCoords || getValue(row, ["Initial location"]) || row.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {getValue(row, ["Initial location"]) || "—"}
                    </a>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{getValue(row, ["Initial fuel level"]) || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{getValue(row, ["Final fuel level"]) || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{getValue(row, ["Drained"]) || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onDownloadXlsx}
            style={{
              padding: "6px 10px",
              fontSize: ".75rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(22,163,74,0.35)",
              background: "rgba(22,163,74,0.1)",
              color: "#15803d",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Download XLSX
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onPrev}
          disabled={currentPage === 1}
          style={{
            padding: "6px 10px",
            fontSize: ".75rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            cursor: currentPage === 1 ? "not-allowed" : "pointer",
            opacity: currentPage === 1 ? 0.6 : 1,
          }}
        >
          Prev
        </button>
        <span style={{ fontSize: ".75rem", color: "var(--text2)", minWidth: 80, textAlign: "center" }}>
          Page {currentPage} / {totalPages}
        </span>
        <button
          onClick={onNext}
          disabled={currentPage === totalPages}
          style={{
            padding: "6px 10px",
            fontSize: ".75rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            cursor: currentPage === totalPages ? "not-allowed" : "pointer",
            opacity: currentPage === totalPages ? 0.6 : 1,
          }}
        >
          Next
        </button>
        </div>
      </div>
    </div>
  );
}

export default function Fuel({ data, loading, error, startDate, endDate, onStartChange, onEndChange, onRun }: SharedTabProps) {
  const fuelFillings = useMemo(() => data?.fuelFillings ?? [], [data?.fuelFillings]);
  const fuelDrains = useMemo(() => data?.fuelDrains ?? [], [data?.fuelDrains]);
  const [selectedVehicle, setSelectedVehicle] = useState("ALL");
  const [fillingsPage, setFillingsPage] = useState(0);
  const [drainsPage, setDrainsPage] = useState(0);
  const driverAliasMap = useMemo(
    () => buildDriverAliasMap([
      ...fuelFillings.map((r) => getValue(r, ["Driver"]) || r.driver),
      ...fuelDrains.map((r) => getValue(r, ["Driver"]) || r.driver),
    ]),
    [fuelFillings, fuelDrains],
  );
  const getDriverAlias = (name: string) => aliasDriverName(name, driverAliasMap);

  const vehicleOptions = useMemo(() => {
    const fromFillings = fuelFillings.map((r) => r.vehicle).filter(Boolean);
    const fromDrains = fuelDrains.map((r) => r.vehicle).filter(Boolean);
    return [...new Set([...fromFillings, ...fromDrains])].sort();
  }, [fuelFillings, fuelDrains]);

  const hasMeaningfulDrainValues = (row: FuelRecord) => {
    const drained = getValue(row, ["Drained"]);
    const initialLocation = getValue(row, ["Initial location"]);
    const finalLocation = getValue(row, ["Final location"]);
    const drainTime = getValue(row, ["Drain time"]);
    return parseNumeric(drained) > 0
      || (initialLocation && initialLocation !== "-----")
      || (finalLocation && finalLocation !== "-----")
      || (drainTime && drainTime !== "-----");
  };

  const filteredFillings = useMemo(
    () => fuelFillings.filter((r) => selectedVehicle === "ALL" || r.vehicle === selectedVehicle),
    [fuelFillings, selectedVehicle],
  );

  const filteredDrains = useMemo(
    () => fuelDrains
      .filter((r) => selectedVehicle === "ALL" || r.vehicle === selectedVehicle)
      .filter(hasMeaningfulDrainValues),
    [fuelDrains, selectedVehicle],
  );

  const totalFilledLitres = useMemo(
    () => filteredFillings.reduce((sum, row) => sum + parseNumeric(getValue(row, ["Filled"])), 0),
    [filteredFillings],
  );

  const totalDrainedLitres = useMemo(
    () => filteredDrains.reduce((sum, row) => sum + parseNumeric(getValue(row, ["Drained"])), 0),
    [filteredDrains],
  );

  const fillingsTotalPages = Math.max(1, Math.ceil(filteredFillings.length / MAX_FUEL_ROWS));
  const drainsTotalPages = Math.max(1, Math.ceil(filteredDrains.length / MAX_FUEL_ROWS));
  const safeFillingsPage = Math.min(fillingsPage, fillingsTotalPages - 1);
  const safeDrainsPage = Math.min(drainsPage, drainsTotalPages - 1);

  const visibleDrains = useMemo(
    () =>
      filteredDrains.slice(
        safeDrainsPage * MAX_FUEL_ROWS,
        (safeDrainsPage + 1) * MAX_FUEL_ROWS,
      ),
    [filteredDrains, safeDrainsPage],
  );

  const visibleFillings = useMemo(
    () =>
      filteredFillings.slice(
        safeFillingsPage * MAX_FUEL_ROWS,
        (safeFillingsPage + 1) * MAX_FUEL_ROWS,
      ),
    [filteredFillings, safeFillingsPage],
  );

  const downloadAllFuelSheets = () =>
    downloadFuelWorkbook(
      filteredFillings.map((row, idx) => [
        idx + 1,
        row.vehicle || row.grouping,
        getDriverAlias(getValue(row, ["Driver"]) || row.driver || ""),
        getValue(row, ["Filling or charge time"]),
        row.location || "—",
        getValue(row, ["Initial fuel level"]) || "—",
        getValue(row, ["Final fuel level"]) || "—",
        getValue(row, ["Filled"]) || "—",
      ]),
      filteredDrains.map((row, idx) => [
        idx + 1,
        row.vehicle || row.grouping,
        getDriverAlias(getValue(row, ["Driver"]) || row.driver || ""),
        getValue(row, ["Drain time"]) || "—",
        getValue(row, ["Initial location"]) || "—",
        getValue(row, ["Initial fuel level"]) || "—",
        getValue(row, ["Final fuel level"]) || "—",
        getValue(row, ["Drained"]) || "—",
      ]),
    );

  return (
    <div>
      <PageHeader
        title="Fuel"
        titleAccent="Operations"
        right={(
          <DateFilter
            startDate={startDate}
            endDate={endDate}
            onStartChange={onStartChange}
            onEndChange={onEndChange}
            onRun={onRun}
            running={loading}
          />
        )}
      />
      {error && <p style={{ color: "var(--red)", marginBottom: 12, fontSize: ".82rem" }}>{error}</p>}
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <label
          htmlFor="fuel-vehicle-filter"
          style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--text)" }}
        >
          Vehicle
        </label>
        <select
          id="fuel-vehicle-filter"
          value={selectedVehicle}
          onChange={(e) => setSelectedVehicle(e.target.value)}
          style={{
            minWidth: 180,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--border2)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: ".78rem",
            fontWeight: 600,
          }}
        >
          <option value="ALL">All Vehicles</option>
          {vehicleOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button
          onClick={downloadAllFuelSheets}
          style={{
            padding: "6px 10px",
            fontSize: ".75rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(47,111,237,0.35)",
            background: "rgba(47,111,237,0.1)",
            color: "var(--blue)",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Download All
        </button>
      </div>

      <div style={{ display: "grid", gap: "16px" }}>
        <FuelFillingsTable
          rows={visibleFillings}
          page={safeFillingsPage}
          totalRows={filteredFillings.length}
          allRows={filteredFillings}
          totalFilled={totalFilledLitres}
          getDriverAlias={getDriverAlias}
          onDownloadXlsx={() =>
            downloadTableXlsx(
              "fuel_fillings",
              ["#", "Vehicle", "Driver", "Filling date", "Location", "Initial fuel level", "Final fuel level", "Fuel Filled"],
              filteredFillings.map((row, idx) => [
                idx + 1,
                row.vehicle || row.grouping,
                getDriverAlias(getValue(row, ["Driver"]) || row.driver || ""),
                getValue(row, ["Filling or charge time"]),
                row.location || "—",
                getValue(row, ["Initial fuel level"]) || "—",
                getValue(row, ["Final fuel level"]) || "—",
                getValue(row, ["Filled"]) || "—",
              ]),
              "Fuel Fillings",
            )
          }
          onPrev={() => setFillingsPage((p) => Math.max(0, p - 1))}
          onNext={() =>
            setFillingsPage((p) =>
              (p + 1) * MAX_FUEL_ROWS < filteredFillings.length ? p + 1 : p,
            )
          }
        />
        <FuelDrainsTable
          rows={visibleDrains}
          page={safeDrainsPage}
          totalRows={filteredDrains.length}
          allRows={filteredDrains}
          totalDrained={totalDrainedLitres}
          getDriverAlias={getDriverAlias}
          onDownloadXlsx={() =>
            downloadTableXlsx(
              "fuel_drains",
              ["#", "Vehicle", "Driver", "Drain time", "Location", "Initial fuel level", "Final fuel level", "Fuel Drained"],
              filteredDrains.map((row, idx) => [
                idx + 1,
                row.vehicle || row.grouping,
                getDriverAlias(getValue(row, ["Driver"]) || row.driver || ""),
                getValue(row, ["Drain time"]) || "—",
                getValue(row, ["Initial location"]) || "—",
                getValue(row, ["Initial fuel level"]) || "—",
                getValue(row, ["Final fuel level"]) || "—",
                getValue(row, ["Drained"]) || "—",
              ]),
              "Fuel Drains",
            )
          }
          onPrev={() => setDrainsPage((p) => Math.max(0, p - 1))}
          onNext={() =>
            setDrainsPage((p) =>
              (p + 1) * MAX_FUEL_ROWS < filteredDrains.length ? p + 1 : p,
            )
          }
        />
      </div>
    </div>
  );
}

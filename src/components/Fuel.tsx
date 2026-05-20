"use client";

import { useCallback, useMemo, useState } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import type { FuelRecord, SharedTabProps } from "../lib/data";
import * as XLSX from "xlsx";
import {
  buildVehicleMissingOrdinalMap,
  formatDriverDisplay,
  isMissingDriver,
  missingDriverFilterValue,
  parseMissingDriverFilterValue,
} from "../lib/driverDisplay";
import {
  SortHeader,
  parseDateTimeMs,
  parseFirstNumber,
  sortRowsBy,
  useTableSort,
  type SortState,
} from "../lib/sortableTable";
import { exportEnaReportPdf, formatDateRangeLabel } from "../lib/exportEnaReportPdf";

const FUEL_DRIVER_SEP = "\x1f";

function fuelDriverKey(vehicle: string, rawDriver: string) {
  return `${String(vehicle ?? "").trim()}${FUEL_DRIVER_SEP}${String(rawDriver ?? "").trim()}`;
}

function parseFuelDriverKey(key: string): { vehicle: string; raw: string } | null {
  const i = key.indexOf(FUEL_DRIVER_SEP);
  if (i < 0) return null;
  return { vehicle: key.slice(0, i), raw: key.slice(i + FUEL_DRIVER_SEP.length) };
}

type ExportCell = string | number | { label: string; query: string };

function buildSheetWithOptionalHyperlinks(
  headers: string[],
  rows: Array<Array<ExportCell>>,
  hyperlinkColumnIndexes: number[],
) {
  const aoa: XLSX.CellObject[][] = [];
  aoa.push(headers.map((h) => ({ t: "s", v: h })));

  for (const row of rows) {
    const out: XLSX.CellObject[] = [];
    for (let i = 0; i < headers.length; i += 1) {
      const cellVal = row[i] ?? "";
      const display = typeof cellVal === "object" && cellVal !== null && "label" in cellVal
        ? String(cellVal.label ?? "")
        : String(cellVal ?? "");
      if (hyperlinkColumnIndexes.includes(i)) {
        const query = typeof cellVal === "object" && cellVal !== null && "query" in cellVal
          ? String(cellVal.query ?? "")
          : display;
        const safeQuery = String(query ?? "").trim();
        if (!safeQuery || safeQuery === "-----" || safeQuery === "—") {
          out.push({ t: "s", v: display });
        } else {
          const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeQuery)}`;
          out.push({ t: "s", v: display, l: { Target: url } });
        }
      } else if (typeof cellVal === "number") {
        out.push({ t: "n", v: cellVal });
      } else {
        out.push({ t: "s", v: display });
      }
    }
    aoa.push(out);
  }

  return XLSX.utils.aoa_to_sheet(aoa);
}

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

function downloadTableXlsx(baseName: string, headers: string[], rows: Array<Array<ExportCell>>, sheetName: string) {
  // Location column is index 3 for both fuel sheets (no "#" column).
  const sheet = buildSheetWithOptionalHyperlinks(headers, rows, [3]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, `${baseName}_${makeTimestamp()}.xlsx`);
}

function downloadFuelWorkbook(
  fillingsRows: Array<Array<ExportCell>>,
  drainRows: Array<Array<ExportCell>>,
) {
  const book = XLSX.utils.book_new();
  const fillingsHeaders = ["Vehicle", "Driver", "Filling date", "Location", "Initial fuel level", "Final fuel level", "Fuel Filled"];
  const drainsHeaders = ["Vehicle", "Driver", "Drain time", "Location", "Initial fuel level", "Final fuel level", "Fuel Drained"];

  XLSX.utils.book_append_sheet(
    book,
    buildSheetWithOptionalHyperlinks(fillingsHeaders, fillingsRows, [3]),
    "Fuel Fillings",
  );
  XLSX.utils.book_append_sheet(
    book,
    buildSheetWithOptionalHyperlinks(drainsHeaders, drainRows, [3]),
    "Fuel Drains",
  );
  XLSX.writeFile(book, `fuel_operations_${makeTimestamp()}.xlsx`);
}

type FuelSortKey =
  | "vehicle"
  | "driver"
  | "date"
  | "location"
  | "initialFuel"
  | "finalFuel"
  | "amount";

function FuelFillingsTable({
  rows,
  page,
  totalRows,
  allRows,
  totalFilled,
  onDownloadXlsx,
  formatDriverCell,
  onPrev,
  onNext,
  sort,
  onToggleSort,
}: {
  rows: FuelRecord[];
  page: number;
  totalRows: number;
  allRows: FuelRecord[];
  totalFilled: number;
  onDownloadXlsx: () => void;
  formatDriverCell: (vehicle: string, rawDriver: string) => string;
  onPrev: () => void;
  onNext: () => void;
  sort: SortState<FuelSortKey>;
  onToggleSort: (key: FuelSortKey) => void;
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
      <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1250px" }}>
          <thead>
            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
              <th style={thStyle}>#</th>
              <SortHeader sortKey="vehicle" label="Vehicle" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="driver" label="Driver" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="date" label="Filling date" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="location" label="Location" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="initialFuel" label="Initial fuel level" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="finalFuel" label="Final fuel level" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="amount" label="Fuel Filled" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
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
                  <td style={{ padding: "10px 12px" }}>
                    {formatDriverCell(row.vehicle || row.grouping || "", getValue(row, ["Driver"]) || row.driver || "")}
                  </td>
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
  formatDriverCell,
  onPrev,
  onNext,
  sort,
  onToggleSort,
}: {
  rows: FuelRecord[];
  page: number;
  totalRows: number;
  allRows: FuelRecord[];
  totalDrained: number;
  onDownloadXlsx: () => void;
  formatDriverCell: (vehicle: string, rawDriver: string) => string;
  onPrev: () => void;
  onNext: () => void;
  sort: SortState<FuelSortKey>;
  onToggleSort: (key: FuelSortKey) => void;
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
      <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1200px" }}>
          <thead>
            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
              <th style={thStyle}>#</th>
              <SortHeader sortKey="vehicle" label="Vehicle" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="driver" label="Driver" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="date" label="Drain time" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="location" label="Location" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="initialFuel" label="Initial fuel level" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="finalFuel" label="Final fuel level" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
              <SortHeader sortKey="amount" label="Fuel Drained" sort={sort} onToggle={onToggleSort} thStyle={thStyle} />
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
                  <td style={{ padding: "10px 12px" }}>
                    {formatDriverCell(row.vehicle || row.grouping || "", getValue(row, ["Driver"]) || row.driver || "")}
                  </td>
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
  const violations = useMemo(() => data?.violations ?? [], [data?.violations]);
  const driversSummary = useMemo(() => data?.drivers ?? [], [data?.drivers]);
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

  const [selectedVehicle, setSelectedVehicle] = useState("ALL");
  const [selectedDriver, setSelectedDriver] = useState("ALL");
  const [fillingsPage, setFillingsPage] = useState(0);
  const [drainsPage, setDrainsPage] = useState(0);

  const vehicleOptions = useMemo(() => {
    const fromFillings = fuelFillings.map((r) => r.vehicle).filter(Boolean);
    const fromDrains = fuelDrains.map((r) => r.vehicle).filter(Boolean);
    return [...new Set([...fromFillings, ...fromDrains])].sort();
  }, [fuelFillings, fuelDrains]);

  const driverSelectOptions = useMemo(() => {
    const byValue = new Map<string, string>();
    const consider = (r: FuelRecord) => {
      const v = String(r.vehicle || r.grouping || "").trim();
      if (!v) return;
      if (selectedVehicle !== "ALL" && v !== selectedVehicle) return;
      const raw = getValue(r, ["Driver"]) || r.driver || "";
      const value = isMissingDriver(raw) ? missingDriverFilterValue(v) : fuelDriverKey(v, raw);
      const driverLabel = formatDriverDisplay({
        vehicle: v,
        rawDriver: raw,
        missingOrdinalByVehicle,
        violations,
      });
      byValue.set(value, driverLabel);
    };
    fuelFillings.forEach(consider);
    fuelDrains.forEach(consider);
    return [...byValue.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [fuelFillings, fuelDrains, selectedVehicle, missingOrdinalByVehicle, violations]);

  const rowMatchesDriverFilter = useCallback(
    (r: FuelRecord) => {
      if (selectedDriver === "ALL") return true;
      const missVeh = parseMissingDriverFilterValue(selectedDriver);
      if (missVeh) {
        const v = String(r.vehicle || r.grouping || "").trim();
        if (v !== missVeh) return false;
        return isMissingDriver(getValue(r, ["Driver"]) || r.driver || "");
      }
      const parsed = parseFuelDriverKey(selectedDriver);
      if (!parsed) return false;
      const v = String(r.vehicle || r.grouping || "").trim();
      const raw = getValue(r, ["Driver"]) || r.driver || "";
      return v === parsed.vehicle && raw === parsed.raw;
    },
    [selectedDriver],
  );

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

  const hasMeaningfulFillingValues = (row: FuelRecord) => {
    const filled = getValue(row, ["Filled"]);
    const fillingTime = getValue(row, ["Filling or charge time"]);
    const location = getValue(row, ["Location"]) || row.location;
    const initialFuel = getValue(row, ["Initial fuel level"]);
    const finalFuel = getValue(row, ["Final fuel level"]);
    return parseNumeric(filled) > 0
      || (fillingTime && fillingTime !== "-----")
      || (location && location !== "-----")
      || (initialFuel && initialFuel !== "-----")
      || (finalFuel && finalFuel !== "-----");
  };

  const baseFillings = useMemo(
    () =>
      fuelFillings
        .filter((r) => selectedVehicle === "ALL" || r.vehicle === selectedVehicle)
        .filter(rowMatchesDriverFilter)
        .filter(hasMeaningfulFillingValues),
    [fuelFillings, selectedVehicle, rowMatchesDriverFilter],
  );

  const baseDrains = useMemo(
    () =>
      fuelDrains
        .filter((r) => selectedVehicle === "ALL" || r.vehicle === selectedVehicle)
        .filter(rowMatchesDriverFilter)
        .filter(hasMeaningfulDrainValues),
    [fuelDrains, selectedVehicle, rowMatchesDriverFilter],
  );

  const { sort: fillingsSort, toggleSort: toggleFillingsSort } = useTableSort<FuelSortKey>({
    key: "date",
    dir: "desc",
  });
  const { sort: drainsSort, toggleSort: toggleDrainsSort } = useTableSort<FuelSortKey>({
    key: "date",
    dir: "desc",
  });

  const filteredFillings = useMemo(
    () =>
      sortRowsBy(baseFillings, fillingsSort, (row, key) => {
        switch (key) {
          case "vehicle":
            return row.vehicle || row.grouping;
          case "driver":
            return formatDriverCell(
              row.vehicle || row.grouping || "",
              getValue(row, ["Driver"]) || row.driver || "",
            );
          case "date":
            return parseDateTimeMs(getValue(row, ["Filling or charge time"]));
          case "location":
            return row.location;
          case "initialFuel":
            return parseFirstNumber(getValue(row, ["Initial fuel level"]));
          case "finalFuel":
            return parseFirstNumber(getValue(row, ["Final fuel level"]));
          case "amount":
            return parseFirstNumber(getValue(row, ["Filled"]));
          default:
            return 0;
        }
      }),
    [baseFillings, fillingsSort, formatDriverCell],
  );

  const filteredDrains = useMemo(
    () =>
      sortRowsBy(baseDrains, drainsSort, (row, key) => {
        switch (key) {
          case "vehicle":
            return row.vehicle || row.grouping;
          case "driver":
            return formatDriverCell(
              row.vehicle || row.grouping || "",
              getValue(row, ["Driver"]) || row.driver || "",
            );
          case "date":
            return parseDateTimeMs(getValue(row, ["Drain time"]));
          case "location":
            return getValue(row, ["Initial location"]) || row.location;
          case "initialFuel":
            return parseFirstNumber(getValue(row, ["Initial fuel level"]));
          case "finalFuel":
            return parseFirstNumber(getValue(row, ["Final fuel level"]));
          case "amount":
            return parseFirstNumber(getValue(row, ["Drained"]));
          default:
            return 0;
        }
      }),
    [baseDrains, drainsSort, formatDriverCell],
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
      filteredFillings.map((row) => [
        row.vehicle || row.grouping,
        formatDriverCell(row.vehicle || row.grouping || "", getValue(row, ["Driver"]) || row.driver || ""),
        getValue(row, ["Filling or charge time"]),
        { label: row.location || "—", query: row.locationCoords || row.location || "" },
        getValue(row, ["Initial fuel level"]) || "—",
        getValue(row, ["Final fuel level"]) || "—",
        getValue(row, ["Filled"]) || "—",
      ]),
      filteredDrains.map((row) => [
        row.vehicle || row.grouping,
        formatDriverCell(row.vehicle || row.grouping || "", getValue(row, ["Driver"]) || row.driver || ""),
        getValue(row, ["Drain time"]) || "—",
        {
          label: getValue(row, ["Initial location"]) || "—",
          query: row.locationCoords || getValue(row, ["Initial location"]) || row.location || "",
        },
        getValue(row, ["Initial fuel level"]) || "—",
        getValue(row, ["Final fuel level"]) || "—",
        getValue(row, ["Drained"]) || "—",
      ]),
    );

  const downloadFuelReportPdf = () => {
    const scopeBits = [
      selectedVehicle === "ALL" ? "All Vehicles" : selectedVehicle,
      selectedDriver === "ALL"
        ? "All Drivers"
        : (driverSelectOptions.find((o) => o.value === selectedDriver)?.label ?? "Selected Driver"),
    ];

    const fillingsHead = [[
      "#",
      "Vehicle",
      "Driver",
      "Filling Date",
      "Location",
      "Initial Fuel (L)",
      "Final Fuel (L)",
      "Filled (L)",
    ]];
    const fillingsBody = filteredFillings.map((row, idx) => [
      idx + 1,
      row.vehicle || row.grouping || "—",
      formatDriverCell(row.vehicle || row.grouping || "", getValue(row, ["Driver"]) || row.driver || ""),
      getValue(row, ["Filling or charge time"]) || "—",
      row.location || "—",
      getValue(row, ["Initial fuel level"]) || "—",
      getValue(row, ["Final fuel level"]) || "—",
      getValue(row, ["Filled"]) || "—",
    ]);

    const drainsHead = [[
      "#",
      "Vehicle",
      "Driver",
      "Drain Time",
      "Initial Location",
      "Initial Fuel (L)",
      "Final Fuel (L)",
      "Drained (L)",
    ]];
    const drainsBody = filteredDrains.map((row, idx) => [
      idx + 1,
      row.vehicle || row.grouping || "—",
      formatDriverCell(row.vehicle || row.grouping || "", getValue(row, ["Driver"]) || row.driver || ""),
      getValue(row, ["Drain time"]) || "—",
      getValue(row, ["Initial location"]) || "—",
      getValue(row, ["Initial fuel level"]) || "—",
      getValue(row, ["Final fuel level"]) || "—",
      getValue(row, ["Drained"]) || "—",
    ]);

    void exportEnaReportPdf({
      title: "Ena Fleet Fuel Report",
      subtitle: formatDateRangeLabel(startDate, endDate),
      summary: [
        {
          label: "Total Refills",
          value: `${filteredFillings.length.toLocaleString()} fills · ${totalFilledLitres.toFixed(2)} L`,
          accent: "#15803d",
        },
        {
          label: "Total Drains",
          value: `${filteredDrains.length.toLocaleString()} drains · ${totalDrainedLitres.toFixed(2)} L`,
          accent: "#b91c1c",
        },
        {
          label: "Net Fuel",
          value: `${(totalFilledLitres - totalDrainedLitres).toFixed(2)} L`,
          accent: totalFilledLitres - totalDrainedLitres >= 0 ? "#15803d" : "#b91c1c",
        },
        {
          label: "Scope",
          value: scopeBits.join(" · "),
        },
      ],
      narrative:
        filteredFillings.length === 0 && filteredDrains.length === 0
          ? "No fuel fillings or drains were recorded for this period and scope."
          : `Summary of fuel fillings and drains for the selected period. ${filteredFillings.length} filling event${filteredFillings.length === 1 ? "" : "s"} totalling ${totalFilledLitres.toFixed(2)} L, and ${filteredDrains.length} drain event${filteredDrains.length === 1 ? "" : "s"} totalling ${totalDrainedLitres.toFixed(2)} L.`,
      sections: [
        { heading: "Fuel Fillings", head: fillingsHead, body: fillingsBody },
        { heading: "Fuel Drains", head: drainsHead, body: drainsBody },
      ],
      fileName: `ena_fleet_fuel_report_${makeTimestamp()}.pdf`,
      landscape: true,
    });
  };

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "auto", overflowY: "visible" }}>
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
          onChange={(e) => {
            setSelectedVehicle(e.target.value);
            setSelectedDriver("ALL");
            setFillingsPage(0);
            setDrainsPage(0);
          }}
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

        <label
          htmlFor="fuel-driver-filter"
          style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--text)", marginLeft: 6 }}
        >
          Driver
        </label>
        <select
          id="fuel-driver-filter"
          value={selectedDriver}
          onChange={(e) => {
            setSelectedDriver(e.target.value);
            setFillingsPage(0);
            setDrainsPage(0);
          }}
          style={{
            minWidth: 220,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--border2)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: ".78rem",
            fontWeight: 600,
          }}
        >
          <option value="ALL">All Drivers</option>
          {driverSelectOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={downloadFuelReportPdf}
          style={{
            padding: "6px 10px",
            fontSize: ".75rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid rgba(220,38,38,0.35)",
            background: "rgba(220,38,38,0.1)",
            color: "#b91c1c",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Download PDF
        </button>
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
          Download All XLSX
        </button>
      </div>

      <div style={{ display: "grid", gap: "16px" }}>
        <FuelFillingsTable
          rows={visibleFillings}
          page={safeFillingsPage}
          totalRows={filteredFillings.length}
          allRows={filteredFillings}
          totalFilled={totalFilledLitres}
          formatDriverCell={formatDriverCell}
          sort={fillingsSort}
          onToggleSort={toggleFillingsSort}
          onDownloadXlsx={() =>
            downloadTableXlsx(
              "fuel_fillings",
              ["Vehicle", "Driver", "Filling date", "Location", "Initial fuel level", "Final fuel level", "Fuel Filled"],
              filteredFillings.map((row) => [
                row.vehicle || row.grouping,
                formatDriverCell(row.vehicle || row.grouping || "", getValue(row, ["Driver"]) || row.driver || ""),
                getValue(row, ["Filling or charge time"]),
                { label: row.location || "—", query: row.locationCoords || row.location || "" },
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
          formatDriverCell={formatDriverCell}
          sort={drainsSort}
          onToggleSort={toggleDrainsSort}
          onDownloadXlsx={() =>
            downloadTableXlsx(
              "fuel_drains",
              ["Vehicle", "Driver", "Drain time", "Location", "Initial fuel level", "Final fuel level", "Fuel Drained"],
              filteredDrains.map((row) => [
                row.vehicle || row.grouping,
                formatDriverCell(row.vehicle || row.grouping || "", getValue(row, ["Driver"]) || row.driver || ""),
                getValue(row, ["Drain time"]) || "—",
                {
                  label: getValue(row, ["Initial location"]) || "—",
                  query: row.locationCoords || getValue(row, ["Initial location"]) || row.location || "",
                },
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

"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import type { SharedTabProps } from "../lib/data";
import { CornerDownRight, Truck } from "lucide-react";
import * as XLSX from "xlsx";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver } from "../lib/driverDisplay";
import { exportEnaReportPdf, formatDateRangeLabel } from "../lib/exportEnaReportPdf";
import {
  SortHeader,
  parseDurationSeconds,
  parseFirstNumber,
  sortRowsBy,
  useTableSort,
} from "../lib/sortableTable";

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

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : parseFirstNumber(value as string | number | null | undefined);
}

export default function VehiclePerformancePage({
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
}: SharedTabProps) {
  const drivers = useMemo(() => data?.drivers ?? [], [data?.drivers]);
  const violations = useMemo(() => data?.violations ?? [], [data?.violations]);
  const vehiclePerformance = useMemo(() => data?.vehiclePerformance ?? [], [data?.vehiclePerformance]);
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const extraMissingVehicles = useMemo(
    () => drivers.filter((d) => isMissingDriver(d.name)).map((d) => d.vehicle),
    [drivers],
  );
  const missingOrdinalByVehicle = useMemo(
    () => buildVehicleMissingOrdinalMap(violations, [], [], extraMissingVehicles),
    [violations, extraMissingVehicles],
  );
  const driverLabel = useCallback(
    (vehicle: string, rawName: string) =>
      formatDriverDisplay({ vehicle, rawDriver: rawName, missingOrdinalByVehicle, violations }),
    [missingOrdinalByVehicle, violations],
  );

  const perfByVehicle = useMemo(() => {
    const map = new Map<string, (typeof vehiclePerformance)[number]>();
    for (const v of vehiclePerformance) map.set(v.vehicle, v);
    return map;
  }, [vehiclePerformance]);

  type VehicleSortKey =
    | "vehicle"
    | "distance"
    | "fuelConsumed"
    | "consumption"
    | "fillings"
    | "fuelFilled"
    | "drains"
    | "fuelDrained"
    | "avgSpeed"
    | "engineHours"
    | "idlingTime";
  const { sort: vehicleSort, toggleSort: toggleVehicleSort } = useTableSort<VehicleSortKey>(null);
  const sortedDrivers = useMemo(
    () =>
      sortRowsBy(drivers, vehicleSort, (row, key) => {
        switch (key) {
          case "vehicle":
            return row.vehicle;
          case "distance":
            return Number(row.distance ?? 0);
          case "fuelConsumed":
            return Number(row.fuelConsumed ?? 0);
          case "consumption":
            return Number(row.avgConsumption ?? 0);
          case "fillings":
            return Number(row.totalFillings ?? 0);
          case "fuelFilled":
            return Number(row.fuelFilled ?? 0);
          case "drains":
            return Number(row.totalDrains ?? 0);
          case "fuelDrained":
            return Number(row.fuelDrained ?? 0);
          case "avgSpeed":
            return parseFirstNumber(row.avgSpeed as unknown as string | number);
          case "engineHours":
            return parseDurationSeconds(row.engineRunningTime);
          case "idlingTime":
            return parseDurationSeconds(row.idlingEngineTime ?? "00:00:00");
          default:
            return 0;
        }
      }),
    [drivers, vehicleSort],
  );

  const vehicleRowsForDownload = useMemo(() => {
    const rows: Array<Record<string, string | number>> = [];
    for (const d of drivers) {
      rows.push({
        level: "Vehicle",
        name: d.vehicle,
        distanceKm: d.distance,
        consumedFuelL: d.fuelConsumed,
        consumptionKmPerL: d.avgConsumption.toFixed(2),
        fuelFillsCount: d.totalFillings,
        totalFilledL: d.fuelFilled,
        fuelDrainsCount: d.totalDrains,
        totalDrainedL: d.fuelDrained,
        avgSpeedKmH: d.avgSpeed,
        engineTime: d.engineRunningTime,
        idlingTime: d.idlingEngineTime ?? "00:00:00",
      });
      const perf = perfByVehicle.get(d.vehicle);
      for (const dd of perf?.drivers ?? []) {
        const summaryDriver =
          drivers.find((drv) => drv.id === dd.driverId) ??
          drivers.find((drv) => drv.name === dd.driverName && drv.vehicle === d.vehicle) ??
          drivers.find((drv) => drv.vehicle === d.vehicle) ??
          d;
        rows.push({
          level: "Driver Detail",
          name: driverLabel(d.vehicle, dd.driverName),
          distanceKm: dd.distanceKm,
          consumedFuelL: dd.consumptionLitres,
          consumptionKmPerL: dd.consumptionKmPerL.toFixed(2),
          fuelFillsCount: summaryDriver.totalFillings,
          totalFilledL: summaryDriver.fuelFilled,
          fuelDrainsCount: summaryDriver.totalDrains,
          totalDrainedL: summaryDriver.fuelDrained,
          avgSpeedKmH: summaryDriver.avgSpeed,
          engineTime: summaryDriver.engineRunningTime,
          idlingTime: summaryDriver.idlingEngineTime ?? "00:00:00",
        });
      }
    }
    return rows;
  }, [drivers, perfByVehicle, driverLabel]);

  const downloadVehiclePerformancePdf = () => {
    const head = [[
      "Level",
      "Name",
      "Distance (km)",
      "Consumed Fuel (L)",
      "Consumption (km/L)",
      "# Fillings",
      "Total Filled (L)",
      "# Drains",
      "Total Drained (L)",
      "Avg Speed",
      "Engine Hours",
      "Idling Time",
    ]];
    const body = vehicleRowsForDownload.map((row) => [
      String(row.level),
      String(row.name),
      row.distanceKm,
      row.consumedFuelL,
      row.consumptionKmPerL,
      row.fuelFillsCount,
      row.totalFilledL,
      row.fuelDrainsCount,
      row.totalDrainedL,
      row.avgSpeedKmH,
      row.engineTime,
      row.idlingTime,
    ]);

    const totalVehicles = drivers.length;
    const totalDistance = drivers.reduce((sum, d) => sum + safeNumber(d.distance), 0);
    const totalFuelConsumed = drivers.reduce((sum, d) => sum + safeNumber(d.fuelConsumed), 0);
    const totalFuelFilled = drivers.reduce((sum, d) => sum + safeNumber(d.fuelFilled), 0);
    const totalFuelDrained = drivers.reduce((sum, d) => sum + safeNumber(d.fuelDrained), 0);
    const avgConsumption = totalFuelConsumed > 0 ? totalDistance / totalFuelConsumed : 0;

    void exportEnaReportPdf({
      title: "Ena Fleet Vehicle Performance Report",
      subtitle: formatDateRangeLabel(startDate, endDate),
      summary: [
        { label: "Vehicles", value: totalVehicles.toLocaleString() },
        { label: "Total Distance", value: `${totalDistance.toFixed(0)} km` },
        { label: "Fuel Consumed", value: `${totalFuelConsumed.toFixed(2)} L` },
        { label: "Avg Consumption", value: `${avgConsumption.toFixed(2)} km/L` },
      ],
      narrative:
        totalVehicles === 0
          ? "No vehicle activity recorded for this period."
          : `Performance summary for ${totalVehicles} vehicle${totalVehicles === 1 ? "" : "s"}. Refills ${totalFuelFilled.toFixed(2)} L, drains ${totalFuelDrained.toFixed(2)} L. Each vehicle row is followed by its driver-level breakdown.`,
      sections: [{ heading: "Vehicle & Driver Breakdown", head, body }],
      fileName: `ena_fleet_vehicle_performance_${makeTimestamp()}.pdf`,
      landscape: true,
    });
  };

  const downloadVehiclePerformanceXlsx = () => {
    const rows = vehicleRowsForDownload.map((row) => ({
      Level: row.level,
      Name: row.name,
      "Distance (km)": row.distanceKm,
      "Consumed Fuel (L)": row.consumedFuelL,
      "Consumption (km/L)": row.consumptionKmPerL,
      "# Fillings": row.fuelFillsCount,
      "Total Filled": row.totalFilledL,
      "# Drains": row.fuelDrainsCount,
      "Total Drained": row.totalDrainedL,
      "Avg Speed": row.avgSpeedKmH,
      "Engine Hours": row.engineTime,
      "Idling Time": row.idlingTime,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Vehicle Performance");
    XLSX.writeFile(book, `vehicle_performance_${makeTimestamp()}.xlsx`);
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
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "auto", overflowY: "visible" }}>
      <PageHeader
        title="Vehicle"
        titleAccent="Performance"
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

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
        <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1100px" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                <th style={{ ...thStyle, width: "46px" }}>View</th>
                <SortHeader sortKey="vehicle" label="Vehicle" sort={vehicleSort} onToggle={toggleVehicleSort} thStyle={thStyle} />
                <SortHeader sortKey="distance" label="Distance (km)" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="fuelConsumed" label="Consumed Fuel (L)" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="consumption" label="Consumption (km/L)" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="fillings" label="# Fillings" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="fuelFilled" label="Total Filled" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="drains" label="# Drains" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="fuelDrained" label="Total Drained" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="avgSpeed" label="Avg Speed" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="engineHours" label="Engine Hours" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
                <SortHeader sortKey="idlingTime" label="Idling Time" sort={vehicleSort} onToggle={toggleVehicleSort} align="right" thStyle={thStyle} />
              </tr>
            </thead>
            <tbody>
              {sortedDrivers.map((d) => {
                const isExpanded = expandedVehicle === d.vehicle;
                const perf = perfByVehicle.get(d.vehicle);
                const detailDrivers = perf?.drivers ?? [];
                return (
                  <Fragment key={d.vehicle}>
                    <tr
                      onClick={() => setExpandedVehicle(isExpanded ? null : d.vehicle)}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: isExpanded ? "rgba(47,111,237,0.08)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            minWidth: "28px",
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: isExpanded ? "rgba(47,111,237,.16)" : "rgba(47,111,237,.08)",
                            color: "var(--blue)",
                            fontWeight: 700,
                          }}
                        >
                          {isExpanded ? "Hide" : "Show"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                        <Truck size={16} color="var(--blue)" /> {d.vehicle}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800 }}>{d.distance.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.fuelConsumed.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.avgConsumption.toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.totalFillings}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.fuelFilled.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.totalDrains}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.fuelDrained.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.avgSpeed}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.engineRunningTime}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.idlingEngineTime ?? "00:00:00"}</td>
                    </tr>

                    {isExpanded && (
                      detailDrivers.length ? (
                        detailDrivers.map((dd) => {
                          const summaryDriver =
                            drivers.find((drv) => drv.id === dd.driverId) ??
                            drivers.find((drv) => drv.name === dd.driverName && drv.vehicle === d.vehicle) ??
                            drivers.find((drv) => drv.vehicle === d.vehicle) ??
                            d;
                          return (
                          <tr key={dd.driverId} style={{ borderBottom: "1px solid #dbe7ff", background: "#f4f8ff" }}>
                            <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--blue)", fontWeight: 700 }}>
                              <CornerDownRight size={14} />
                            </td>
                            <td style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px", paddingLeft: "20px" }}>
                              <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "var(--blue)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem", fontWeight: 800 }}>
                                {(driverLabel(d.vehicle, dd.driverName).split(" ").slice(-1)[0]?.charAt(0) ?? "D").toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 800 }}>{driverLabel(d.vehicle, dd.driverName)}</span>
                            </td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{dd.distanceKm.toLocaleString()}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{dd.consumptionLitres.toLocaleString()}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{dd.consumptionKmPerL.toFixed(2)}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.totalFillings}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.fuelFilled.toLocaleString()}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.totalDrains}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.fuelDrained.toLocaleString()}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.avgSpeed}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.engineRunningTime}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.idlingEngineTime ?? "00:00:00"}</td>
                          </tr>
                        )})
                      ) : (
                        <tr style={{ borderBottom: "1px solid #dbe7ff", background: "#f4f8ff" }}>
                          <td style={{ padding: "10px 12px" }} />
                          <td colSpan={10} style={{ padding: "12px 14px", color: "var(--text3)" }}>
                            No driver breakdown available for this vehicle.
                          </td>
                        </tr>
                      )
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={downloadVehiclePerformancePdf}
            style={{
              padding: "8px 12px",
              fontSize: ".76rem",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(47,111,237,0.35)",
              background: "rgba(47,111,237,0.1)",
              color: "var(--blue)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={downloadVehiclePerformanceXlsx}
            style={{
              padding: "8px 12px",
              fontSize: ".76rem",
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
      </div>
    </div>
  );
}


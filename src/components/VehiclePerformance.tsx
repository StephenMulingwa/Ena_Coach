"use client";

import { Fragment, useMemo, useState } from "react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import type { SharedTabProps } from "../lib/data";
import { CornerDownRight, Truck } from "lucide-react";
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
  const drivers = data?.drivers ?? [];
  const vehiclePerformance = data?.vehiclePerformance ?? [];
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);

  const perfByVehicle = useMemo(() => {
    const map = new Map<string, (typeof vehiclePerformance)[number]>();
    for (const v of vehiclePerformance) map.set(v.vehicle, v);
    return map;
  }, [vehiclePerformance]);

  const vehicleRowsForDownload = useMemo(() => {
    const rows: Array<Record<string, string | number>> = [];
    for (const d of drivers) {
      rows.push({
        level: "Vehicle",
        name: d.vehicle,
        distanceKm: d.distance,
        consumedFuelL: d.fuelConsumed,
        consumptionKmPerL: d.avgConsumption.toFixed(2),
        totalFillings: d.totalFillings,
        totalFilledL: d.fuelFilled,
        totalDrainedL: d.fuelDrained,
        avgSpeedKmH: d.avgSpeed,
        engineHours: d.engineRunningTime,
      });
      const perf = perfByVehicle.get(d.vehicle);
      if (expandedVehicle === d.vehicle) {
        for (const dd of perf?.drivers ?? []) {
          const summaryDriver =
            drivers.find((drv) => drv.name === dd.driverName) ??
            drivers.find((drv) => drv.vehicle === d.vehicle) ??
            d;
          rows.push({
            level: "Driver Detail",
            name: dd.driverName,
            distanceKm: dd.distanceKm,
            consumedFuelL: dd.consumptionLitres,
            consumptionKmPerL: dd.consumptionKmPerL.toFixed(2),
            totalFillings: summaryDriver.totalFillings,
            totalFilledL: summaryDriver.fuelFilled,
            totalDrainedL: summaryDriver.fuelDrained,
            avgSpeedKmH: summaryDriver.avgSpeed,
            engineHours: summaryDriver.engineRunningTime,
          });
        }
      }
    }
    return rows;
  }, [drivers, perfByVehicle, expandedVehicle]);

  const downloadVehiclePerformanceXlsx = () => {
    const rows = vehicleRowsForDownload.map((row) => ({
      Level: row.level,
      Name: row.name,
      "Distance (km)": row.distanceKm,
      "Consumed Fuel (L)": row.consumedFuelL,
      "Consumption (km/L)": row.consumptionKmPerL,
      "Total Fillings": row.totalFillings,
      "Total Filled": row.totalFilledL,
      "Total Drained": row.totalDrainedL,
      "Avg Speed": row.avgSpeedKmH,
      "Engine Hours": row.engineHours,
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
    <div>
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
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: "1100px" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                <th style={{ ...thStyle, width: "46px" }}>View</th>
                <th style={thStyle}>Vehicle</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Distance (km)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Consumed Fuel (L)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Consumption (km/L)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total Fillings</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total Filled</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total Drained</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Avg Speed</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Engine Hours</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
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
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.fuelDrained.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.avgSpeed}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>{d.engineRunningTime}</td>
                    </tr>

                    {isExpanded && (
                      detailDrivers.length ? (
                        detailDrivers.map((dd) => {
                          const summaryDriver =
                            drivers.find((drv) => drv.name === dd.driverName) ??
                            drivers.find((drv) => drv.vehicle === d.vehicle) ??
                            d;
                          return (
                          <tr key={dd.driverId} style={{ borderBottom: "1px solid #dbe7ff", background: "#f4f8ff" }}>
                            <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--blue)", fontWeight: 700 }}>
                              <CornerDownRight size={14} />
                            </td>
                            <td style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px", paddingLeft: "20px" }}>
                              <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "var(--blue)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem", fontWeight: 800 }}>
                                {dd.driverName.charAt(0)}
                              </div>
                              <span style={{ fontWeight: 800 }}>{dd.driverName}</span>
                            </td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{dd.distanceKm.toLocaleString()}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{dd.consumptionLitres.toLocaleString()}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{dd.consumptionKmPerL.toFixed(2)}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.totalFillings}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.fuelFilled.toLocaleString()}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.fuelDrained.toLocaleString()}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.avgSpeed}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}>{summaryDriver.engineRunningTime}</td>
                          </tr>
                        )})
                      ) : (
                        <tr style={{ borderBottom: "1px solid #dbe7ff", background: "#f4f8ff" }}>
                          <td style={{ padding: "10px 12px" }} />
                          <td colSpan={9} style={{ padding: "12px 14px", color: "var(--text3)" }}>
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


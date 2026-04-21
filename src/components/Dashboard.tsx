"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import { VIOLATION_TYPES, type SharedTabProps, type VehicleLocation } from "../lib/data";
import { aliasDriverName, buildDriverAliasMap } from "../lib/driverAlias";

const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];

function toDate(value: string) {
  const [datePart] = value.split(" ");
  const [dd, mm, yyyy] = datePart.split(".").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

export default function Dashboard({
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
  const filteredViolations = data?.violations ?? [];
  const reportRows = data?.finalReport ?? [];
  const vehicleRows = data?.vehiclePerformance ?? [];
  const driverAliasMap = useMemo(
    () => buildDriverAliasMap([
      ...drivers.map((d) => d.name),
      ...filteredViolations.map((v) => v.driver),
      ...reportRows.map((r) => r.driver),
      ...(data?.vehicleLocations ?? []).map((v) => v.driver),
    ]),
    [drivers, filteredViolations, reportRows, data?.vehicleLocations],
  );

  const violationSummary = VIOLATION_TYPES.map((vt) => ({
    name: vt,
    count: filteredViolations.filter((v) => v.violation === vt).length,
  }));

  const totalViolations = filteredViolations.length;
  const totalDistance = drivers.reduce((a, d) => a + d.distance, 0);
  const consumptionLitresTotal = drivers.reduce((sum, d) => sum + (d.fuelConsumed ?? 0), 0);
  const totalFillings = drivers.reduce((sum, d) => sum + (d.totalFillings ?? 0), 0);
  const totalDrains = drivers.reduce((sum, d) => sum + (d.totalDrains ?? 0), 0);
  const avgConsumption = drivers.length
    ? drivers.reduce((a, d) => a + d.avgConsumption, 0) / drivers.length
    : 0;

  const violationCounts = drivers.reduce<Record<string, Record<string, number>>>((acc, d) => {
    const item: Record<string, number> = {};
    for (const vt of VIOLATION_TYPES) {
      item[vt] = filteredViolations.filter((v) => v.driver === d.name && v.violation === vt).length;
    }
    acc[aliasDriverName(d.name, driverAliasMap)] = item;
    return acc;
  }, {});

  const vehicleLocations = (data?.vehicleLocations ?? []).map((loc: VehicleLocation) => ({
    vehicle: loc.vehicle,
    driver: aliasDriverName(loc.driver, driverAliasMap),
    lastLocation: loc.location || "Unknown",
    lastSeen: loc.lastCoordinatesTime || loc.lastMessageTime || "N/A",
    coords: loc.locationCoords || loc.location,
  }));

  const cardStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
  };

  return (
    <div>
      <PageHeader
        title="Fleet"
        titleAccent="Dashboard"
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px", marginBottom: "14px" }}>
        {[
          { label: "Total Violations", value: totalViolations, color: "var(--red)" },
          { label: "Active Vehicles", value: drivers.length, color: "var(--blue)" },
          { label: "Total Distance", value: `${totalDistance.toLocaleString()} km`, color: "var(--green)" },
          { label: "Avg Fuel Consumption", value: `${avgConsumption.toFixed(2)} km/L`, color: "var(--accent)" },
        ].map((kpi) => (
          <div key={kpi.label} style={{ ...cardStyle, padding: "18px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${kpi.color}, transparent)` }} />
            <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, fontSize: "1.9rem", color: "var(--text)", lineHeight: 1 }}>{kpi.value}</div>
            <div style={{ marginTop: 8, fontSize: ".72rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px", marginBottom: "20px" }}>
        {[
          { label: "Consumption (L)", value: consumptionLitresTotal.toLocaleString(), color: "#10b981" },
          { label: "Total Fillings", value: totalFillings, color: "#f97316" },
          { label: "Total Drains", value: totalDrains, color: "#ef4444" },
        ].map((kpi) => (
          <div key={kpi.label} style={{ ...cardStyle, padding: "16px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${kpi.color}, transparent)` }} />
            <div style={{ fontFamily: "var(--font-body)", fontWeight: 800, fontSize: "1.7rem", color: "var(--text)", lineHeight: 1 }}>{kpi.value}</div>
            <div style={{ marginTop: 8, fontSize: ".7rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
        <div style={{ ...cardStyle, minWidth: 0 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)", fontWeight: 700, color: "var(--text)", fontSize: ".9rem" }}>
            Violations by Type
          </div>
          <div style={{ height: 290, padding: "10px 14px", minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={220}>
              <BarChart data={violationSummary}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ecff" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#4d6488" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#4d6488" }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #d9e5ff",
                    background: "#ffffff",
                    boxShadow: "0 8px 18px rgba(20,60,130,.12)",
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {violationSummary.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)", fontWeight: 700, color: "var(--text)", fontSize: ".9rem" }}>
            Driver Violations
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                  <th style={th}>#</th>
                  <th style={th}>Driver</th>
                  {VIOLATION_TYPES.map((v) => <th key={v} style={{ ...th, textAlign: "center" }}>{v}</th>)}
                  <th style={{ ...th, textAlign: "center" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(violationCounts).map(([driver, counts], idx) => {
                  const total = Object.values(counts).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={driver} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{idx + 1}</td>
                      <td style={td}>{driver}</td>
                      {VIOLATION_TYPES.map((v) => <td key={v} style={{ ...td, textAlign: "center" }}>{counts[v]}</td>)}
                      <td style={{ ...td, textAlign: "center", fontWeight: 700, color: "var(--blue)" }}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)", fontWeight: 700, color: "var(--text)", fontSize: ".9rem" }}>
          Vehicle Current Location
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                {["#", "Vehicle", "Driver", "Location", "Last Message Time"].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {vehicleLocations.map((v, i) => (
                <tr key={v.vehicle} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{v.vehicle}</td>
                  <td style={td}>{v.driver}</td>
                  <td style={td}>
                    <a href={`https://www.google.com/maps?q=${encodeURIComponent(v.coords || v.lastLocation)}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 800 }}>
                      {v.lastLocation}
                    </a>
                  </td>
                  <td style={{ ...td, color: "#000000", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{v.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontFamily: "var(--font-body)",
  fontSize: ".68rem",
  color: "#000000",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const td: React.CSSProperties = { padding: "10px 12px" };



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
import { BusFront } from "lucide-react";
import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import { VIOLATION_TYPES, type SharedTabProps, type ViolationType } from "../lib/data";

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
  const hh = String(Math.floor(safe / 3600)).padStart(2, "0");
  const mm = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function DriverEvaluation({
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
}: SharedTabProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string>("ALL");
  const [selectedViolation, setSelectedViolation] = useState<ViolationType | "All">("All");
  const [currentPage, setCurrentPage] = useState(1);
  const drivers = data?.drivers ?? [];
  const filteredViolations = data?.violations ?? [];
  const selectedDriver = selectedDriverId === "ALL"
    ? null
    : drivers.find((d) => d.id === selectedDriverId) ?? null;
  const selectedDriverMetrics = useMemo(() => {
    const selectedDrivers = selectedDriver ? [selectedDriver] : drivers;
    if (selectedDriver) return selectedDriver;
    const totalDistance = selectedDrivers.reduce((sum, d) => sum + (d.distance ?? 0), 0);
    const totalFuelConsumed = selectedDrivers.reduce((sum, d) => sum + (d.fuelConsumed ?? 0), 0);
    const totalFuelFilled = selectedDrivers.reduce((sum, d) => sum + (d.fuelFilled ?? 0), 0);
    const totalFuelDrained = selectedDrivers.reduce((sum, d) => sum + (d.fuelDrained ?? 0), 0);
    const totalFillings = selectedDrivers.reduce((sum, d) => sum + (d.totalFillings ?? 0), 0);
    const totalDrains = selectedDrivers.reduce((sum, d) => sum + (d.totalDrains ?? 0), 0);
    const avgSpeed = selectedDrivers.length
      ? selectedDrivers.reduce((sum, d) => sum + (d.avgSpeed ?? 0), 0) / selectedDrivers.length
      : 0;
    const maxSpeed = selectedDrivers.reduce((max, d) => Math.max(max, d.maxSpeed ?? 0), 0);
    const engineSeconds = selectedDrivers.reduce((sum, d) => sum + durationToSeconds(d.engineRunningTime), 0);
    const idlingSeconds = selectedDrivers.reduce((sum, d) => sum + durationToSeconds(d.idlingEngineTime), 0);
    return {
      id: "ALL",
      name: "All Drivers",
      vehicle: "All Vehicles",
      distance: totalDistance,
      fuelConsumed: totalFuelConsumed,
      fuelFilled: totalFuelFilled,
      fuelDrained: totalFuelDrained,
      totalFillings,
      totalDrains,
      avgSpeed: Number(avgSpeed.toFixed(0)),
      maxSpeed,
      avgConsumption: totalFuelConsumed > 0 ? totalDistance / totalFuelConsumed : 0,
      engineRunningTime: secondsToDuration(engineSeconds),
      idlingEngineTime: secondsToDuration(idlingSeconds),
      propulsion: "Diesel",
      transportWorkAvg: 0,
    };
  }, [selectedDriver, drivers]);

  const driverViolations = selectedDriver
    ? filteredViolations.filter((v) => v.driver === selectedDriver.name)
    : filteredViolations;
  const violationBreakdown = VIOLATION_TYPES.map((vt) => ({
    type: vt,
    count: driverViolations.filter((v) => v.violation === vt).length,
  }));
  const totalViolations = driverViolations.length;
  const tableRows = selectedViolation === "All"
    ? driverViolations
    : driverViolations.filter((row) => row.violation === selectedViolation);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const pagedRows = tableRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
  };

  return (
    <div>
      <PageHeader
        title="Driver"
        titleAccent="Evaluation"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: ".72rem", color: "#000000", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
                Driver
              </span>
              <select
                value={selectedDriverId}
                onChange={(e) => {
                  setSelectedDriverId(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  fontSize: ".82rem",
                  fontWeight: 700,
                  outline: "none",
                  colorScheme: "light",
                  cursor: "pointer",
                  minWidth: "190px",
                }}
              >
                <option value="ALL">All</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <DateFilter
              startDate={startDate}
              endDate={endDate}
              onStartChange={onStartChange}
              onEndChange={onEndChange}
              onRun={onRun}
              running={loading}
            />
          </div>
        }
      />
      {error && <p style={{ color: "var(--red)", marginBottom: 12, fontSize: ".82rem" }}>{error}</p>}

      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
        <div
          style={{
            width: "300px",
            minHeight: "300px",
            flexShrink: 0,
            ...card,
            padding: "22px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, #ffffff 0%, #f7faff 100%)",
            border: "1px solid #dbe7ff",
          }}
        >
          <div>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #2f6fed, #5a8dff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 800,
                fontSize: "1.3rem",
                fontFamily: "var(--font-body)",
                marginBottom: "16px",
                boxShadow: "0 10px 24px rgba(47,111,237,.35)",
              }}
            >
              {selectedDriverMetrics?.name?.charAt(0) ?? "-"}
            </div>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 800, color: "var(--text)", marginBottom: "6px", lineHeight: 1.1 }}>
              {selectedDriverMetrics?.name ?? "No Driver"}
            </h3>
            <p style={{ fontSize: ".84rem", color: "var(--text2)", fontWeight: 700 }}>
              ID: {selectedDriverMetrics?.id ?? "-"}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "var(--surface2)",
              border: "1px solid #d4def5",
              borderRadius: "14px",
              padding: "13px 14px",
            }}
          >
            <BusFront size={22} color="var(--blue)" />
            <div>
              <p style={{ fontSize: ".72rem", color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800 }}>
                Vehicle
              </p>
              <p style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)" }}>
                {selectedDriverMetrics?.vehicle ?? "-"}
              </p>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: "12px" }}>
            {[
              { label: "Total Violations", value: totalViolations },
              { label: "Distance", value: `${selectedDriverMetrics?.distance?.toLocaleString() ?? 0} km` },
              { label: "Engine Time", value: selectedDriverMetrics?.engineRunningTime ?? "-" },
              { label: "Idling Engine Time", value: selectedDriverMetrics?.idlingEngineTime ?? "-" },
            ].map((snapshot) => (
              <div key={snapshot.label} style={{ ...card, padding: "12px 14px", borderTop: "3px solid var(--blue)" }}>
                <p style={{ fontSize: ".7rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800, marginBottom: "6px" }}>
                  {snapshot.label}
                </p>
                <p style={{ fontSize: "1.02rem", fontWeight: 400, color: "var(--text)", fontFamily: "var(--font-body)" }}>
                  {snapshot.value}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            {[
              { label: "Avg Consumption", value: `${selectedDriverMetrics?.avgConsumption?.toFixed(2) ?? 0} km/L` },
              { label: "Avg Speed", value: `${selectedDriverMetrics?.avgSpeed ?? 0} km/h` },
              { label: "Max Speed", value: `${selectedDriverMetrics?.maxSpeed ?? 0} km/h` },
              { label: "Total Fuel Filled", value: `${selectedDriverMetrics?.fuelFilled ?? 0} L` },
              { label: "Total Fuel Drained", value: `${selectedDriverMetrics?.fuelDrained ?? 0} L` },
              { label: "Fuel Consumed", value: `${selectedDriverMetrics?.fuelConsumed ?? 0} L` },
              { label: "Total Fillings", value: selectedDriverMetrics?.totalFillings ?? 0 },
              { label: "Total Drains", value: selectedDriverMetrics?.totalDrains ?? 0 },
            ].map((m) => (
              <div key={m.label} style={{ ...card, padding: "14px" }}>
                <p style={{ fontSize: ".68rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800, marginBottom: "6px" }}>{m.label}</p>
                <p style={{ fontSize: "1.05rem", fontWeight: 400, fontFamily: "var(--font-body)", color: "var(--text)" }}>{m.value}</p>
              </div>
            ))}
          </div>

          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)", fontSize: ".8rem", fontWeight: 700, color: "var(--text)" }}>
              Violation Breakdown
            </div>
            <div style={{ height: 250, padding: "10px 14px", minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={220}>
                <BarChart data={violationBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ecff" />
                  <XAxis dataKey="type" tick={{ fontSize: 11, fill: "#4d6488" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#4d6488" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #d9e5ff",
                      background: "#ffffff",
                      boxShadow: "0 8px 18px rgba(20,60,130,.12)",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[6, 6, 0, 0]}
                    onClick={(entry) => {
                      const label = String(entry?.type ?? "All");
                      setSelectedViolation((prev) => (prev === label ? "All" : (label as ViolationType)));
                      setCurrentPage(1);
                    }}
                  >
                    {violationBreakdown.map((_, i) => (
                      <Cell key={i} fill={["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"][i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "16px", ...card, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: ".82rem", color: "var(--text)" }}>
          Violation Details {selectedViolation === "All" ? "" : `- ${selectedViolation}`}
        </div>
        <div style={{ overflowX: "auto", width: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: 980 }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                {["#", "Vehicle", "Violation", "Beginning", "End", "Duration", "Mileage", "Initial Location", "Final Location"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: ".68rem", fontWeight: 800, color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px" }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                  <td style={{ padding: "10px 12px" }}>{row.vehicle}</td>
                  <td style={{ padding: "10px 12px" }}>{row.violation}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{row.beginning}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{row.end}</td>
                  <td style={{ padding: "10px 12px" }}>{row.duration}</td>
                  <td style={{ padding: "10px 12px" }}>{row.mileage}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(row.initialLocationCoords || row.initialLocation)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {row.initialLocation}
                    </a>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(row.finalLocationCoords || row.finalLocation)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {row.finalLocation}
                    </a>
                  </td>
                </tr>
              ))}
              {pagedRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: "20px", textAlign: "center", color: "var(--text3)" }}>
                    No violations found for this selection.
                  </td>
                </tr>
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



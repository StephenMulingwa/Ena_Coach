"use client";

import { useMemo } from "react";
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
import ChartBox from "./ChartBox";
import { CategoryAxisTick } from "./CategoryAxisTick";
import { useMediaQuery } from "../lib/useMediaQuery";
import { LAYOUT_NARROW_QUERY } from "../lib/breakpoints";
import { VIOLATION_TYPES, type SharedTabProps, type VehicleLocation } from "../lib/data";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver } from "../lib/driverDisplay";

const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];

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
  const narrow = useMediaQuery(LAYOUT_NARROW_QUERY);
  const drivers = useMemo(() => data?.drivers ?? [], [data?.drivers]);
  const filteredViolations = useMemo(() => data?.violations ?? [], [data?.violations]);
  const rawVehicleLocations = useMemo(() => data?.vehicleLocations ?? [], [data?.vehicleLocations]);
  const extraMissingVehicles = useMemo(() => {
    const vehicles: string[] = [];
    for (const d of drivers) {
      if (isMissingDriver(d.name)) vehicles.push(d.vehicle);
    }
    for (const loc of rawVehicleLocations) {
      if (isMissingDriver(loc.driver)) vehicles.push(loc.vehicle);
    }
    return vehicles;
  }, [drivers, rawVehicleLocations]);
  const missingOrdinalByVehicle = useMemo(
    () => buildVehicleMissingOrdinalMap(filteredViolations, [], [], extraMissingVehicles),
    [filteredViolations, extraMissingVehicles],
  );

  const violationSummary = VIOLATION_TYPES.map((vt) => ({
    name: vt,
    count: filteredViolations.filter((v) => v.violation === vt).length,
  }));

  const totalViolations = violationSummary.reduce((sum, row) => sum + row.count, 0);
  const totalDistance = drivers.reduce((a, d) => a + d.distance, 0);
  const consumptionLitresTotal = drivers.reduce((sum, d) => sum + (d.fuelConsumed ?? 0), 0);
  const totalFillings = drivers.reduce((sum, d) => sum + (d.totalFillings ?? 0), 0);
  const totalDrains = drivers.reduce((sum, d) => sum + (d.totalDrains ?? 0), 0);
  const avgConsumption = drivers.length
    ? drivers.reduce((a, d) => a + d.avgConsumption, 0) / drivers.length
    : 0;

  const violationCounts = useMemo(() => {
    return drivers.reduce<Record<string, { label: string; counts: Record<string, number> }>>((acc, d) => {
      const item: Record<string, number> = {};
      for (const vt of VIOLATION_TYPES) {
        item[vt] = filteredViolations.filter(
          (v) => v.driver === d.name && v.vehicle === d.vehicle && v.violation === vt,
        ).length;
      }
      const label = formatDriverDisplay({
        vehicle: d.vehicle,
        rawDriver: d.name,
        missingOrdinalByVehicle,
        violations: filteredViolations,
      });
      acc[d.id] = { label, counts: item };
      return acc;
    }, {});
  }, [drivers, filteredViolations, missingOrdinalByVehicle]);

  const vehicleLocations = rawVehicleLocations.map((loc: VehicleLocation) => ({
    vehicle: loc.vehicle,
    driver: formatDriverDisplay({
      vehicle: loc.vehicle,
      rawDriver: loc.driver,
      missingOrdinalByVehicle,
      violations: filteredViolations,
    }),
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

  const violationsChartMinW = Math.max(340, violationSummary.length * 72);

  return (
    <div
      className="dashboard-root"
      style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "hidden", overflowY: "visible" }}
    >
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "repeat(auto-fit, minmax(140px, 1fr))" : "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "14px",
          marginBottom: "14px",
          minWidth: 0,
          width: "100%",
        }}
      >
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "repeat(auto-fit, minmax(140px, 1fr))" : "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "14px",
          marginBottom: "20px",
          minWidth: 0,
          width: "100%",
        }}
      >
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "1fr" : "1fr 1fr",
          gap: "16px",
          marginBottom: "18px",
          minWidth: 0,
          width: "100%",
          overflowX: "hidden",
        }}
      >
        <div style={{ ...cardStyle, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)", fontWeight: 700, color: "var(--text)", fontSize: ".9rem" }}>
            Violations by Type
          </div>
          <div
            className="tab-chart-scroll tab-chart-scroll--dashboard-chart tab-chart-scroll--dashboard-isolate"
            style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
          >
            <div style={{ padding: "10px 14px 4px", minWidth: violationsChartMinW, width: "100%" }}>
              <ChartBox height={narrow ? 300 : 330} minHeight={220}>
                {(size) => (
                  <ResponsiveContainer width={size.width} height={size.height} debounce={80}>
                <BarChart data={violationSummary} margin={{ top: 8, right: 8, left: 0, bottom: 52 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ecff" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    height={narrow ? 62 : 58}
                    tick={(props) => <CategoryAxisTick {...props} maxChars={narrow ? 11 : 14} />}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#4d6488" }} tickLine={false} axisLine={false} width={36} />
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
                )}
              </ChartBox>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)", fontWeight: 700, color: "var(--text)", fontSize: ".9rem" }}>
            Driver Violations
          </div>
          <div className="data-table-scroll dashboard-table-panel dashboard-table-panel--h-scroll">
            <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse", fontSize: ".8rem", tableLayout: "auto" }}>
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                  <th style={{ ...th, width: 40, minWidth: 40 }}>#</th>
                  <th style={{ ...th, minWidth: 120, maxWidth: 200, whiteSpace: "normal", wordBreak: "break-word" }}>Driver</th>
                  {VIOLATION_TYPES.map((v) => (
                    <th key={v} style={{ ...th, textAlign: "center", minWidth: 52, maxWidth: 88, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.25 }}>
                      {v}
                    </th>
                  ))}
                  <th style={{ ...th, textAlign: "center", minWidth: 52, whiteSpace: "normal" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(violationCounts).map(([rowId, row], idx) => {
                  const total = Object.values(row.counts).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={rowId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{idx + 1}</td>
                      <td style={{ ...td, whiteSpace: "normal", wordBreak: "break-word", maxWidth: 200 }}>{row.label}</td>
                      {VIOLATION_TYPES.map((v) => (
                        <td key={v} style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                          {row.counts[v]}
                        </td>
                      ))}
                      <td style={{ ...td, textAlign: "center", fontWeight: 700, color: "var(--blue)", whiteSpace: "nowrap" }}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)", fontWeight: 700, color: "var(--text)", fontSize: ".9rem" }}>
          Vehicle Current Location
        </div>
        <div className="data-table-scroll dashboard-table-panel dashboard-table-panel--h-scroll">
          <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse", fontSize: ".8rem" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                {["#", "Vehicle", "Driver", "Location", "Last Message Time"].map((h) => (
                  <th key={h} style={{ ...th, ...(h === "Location" ? { minWidth: 160, maxWidth: 280, whiteSpace: "normal" } : {}) }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicleLocations.map((v, i) => (
                <tr key={`${v.vehicle}-${i}`} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: 700, whiteSpace: "normal", wordBreak: "break-word", minWidth: 96, maxWidth: 140 }}>{v.vehicle}</td>
                  <td style={{ ...td, whiteSpace: "normal", wordBreak: "break-word", minWidth: 100, maxWidth: 160 }}>{v.driver}</td>
                  <td style={{ ...td, minWidth: 160, maxWidth: 280, whiteSpace: "normal", wordBreak: "break-word", verticalAlign: "top" }}>
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(v.coords || v.lastLocation)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 800 }}
                    >
                      {v.lastLocation}
                    </a>
                  </td>
                  <td style={{ ...td, color: "#000000", fontFamily: "var(--font-mono)", fontSize: ".72rem", whiteSpace: "nowrap", verticalAlign: "top" }}>{v.lastSeen}</td>
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



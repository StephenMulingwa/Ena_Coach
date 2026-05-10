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
import { CategoryAxisTick } from "./CategoryAxisTick";
import { useMediaQuery } from "../lib/useMediaQuery";
import { LAYOUT_NARROW_QUERY } from "../lib/breakpoints";
import { VIOLATION_TYPES, type Driver, type SharedTabProps } from "../lib/data";
import { buildVehicleMissingOrdinalMap, formatDriverDisplay, isMissingDriver } from "../lib/driverDisplay";
import { downloadPdfTable } from "../lib/exportPdfTable";
import * as XLSX from "xlsx";

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
  const days = Math.floor(safe / 86400);
  const dayRemainder = safe % 86400;
  const hh = String(Math.floor(dayRemainder / 3600)).padStart(2, "0");
  const mm = String(Math.floor((dayRemainder % 3600) / 60)).padStart(2, "0");
  const ss = String(dayRemainder % 60).padStart(2, "0");
  const timePart = `${hh}:${mm}:${ss}`;
  return days > 0 ? `${days} day${days === 1 ? "" : "s"} ${timePart}` : timePart;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function gradeFor(score: number) {
  if (score >= 60) return "Good";
  if (score >= 45) return "Average";
  return "Poor";
}

function computeDriverScore(args: { greenBandPct: number; totalViolationRate: number }) {
  const greenPct = clamp(Number(args.greenBandPct ?? 0), 0, 100);
  const totalRate = Math.max(0, Number(args.totalViolationRate ?? 0));

  const greenScore = (greenPct / 100) * 70;

  // Total violations is defined as sum of the per-100km rates shown in parentheses.
  // Map 0 → 30 points, 30+ → 0 points (linear).
  const violationsScore = clamp(30 * (1 - Math.min(totalRate, 30) / 30), 0, 30);

  const score = clamp(greenScore + violationsScore, 0, 100);
  return { score, grade: gradeFor(score) };
}

function totalViolationRateFor(args: { distanceKm: number; counts: Record<string, number> }) {
  const distance = Math.max(0, args.distanceKm || 0);
  const denom = Math.max(1, distance);
  const per100 = (count: number) => (count / denom) * 100;
  return VIOLATION_TYPES.reduce((sum, vt) => sum + per100(args.counts[vt] ?? 0), 0);
}

/** Speed / detail rows often omit Driver; match on vehicle and treat blank/Missing like Reports' implicit driver. */
function normVehicleLabel(value: string) {
  return String(value ?? "").trim();
}

function normDriverNameLabel(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isBlankDriverCell(value: string) {
  const t = String(value ?? "").trim();
  if (!t) return true;
  if (t === "-----" || t === "—") return true;
  return t.toLowerCase() === "missing";
}

function rowMatchesDriver(vehicle: string, rawDriver: string, d: Driver) {
  if (normVehicleLabel(vehicle) !== normVehicleLabel(d.vehicle)) return false;
  if (isBlankDriverCell(rawDriver)) return true;
  return normDriverNameLabel(rawDriver) === normDriverNameLabel(d.name);
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
  const narrow = useMediaQuery(LAYOUT_NARROW_QUERY);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const drivers = useMemo(() => data?.drivers ?? [], [data?.drivers]);
  const speedRecords = useMemo(() => data?.speed ?? [], [data?.speed]);
  const filteredViolations = useMemo(() => data?.violations ?? [], [data?.violations]);
  const extraMissingVehicles = useMemo(
    () => drivers.filter((d) => isMissingDriver(d.name)).map((d) => d.vehicle),
    [drivers],
  );
  const missingOrdinalByVehicle = useMemo(
    () => buildVehicleMissingOrdinalMap(filteredViolations, [], [], extraMissingVehicles),
    [filteredViolations, extraMissingVehicles],
  );
  const driversInScope = useMemo(
    () => (selectedDriverId === "ALL" ? drivers : drivers.filter((d) => d.id === selectedDriverId)),
    [drivers, selectedDriverId],
  );
  const displayDriverName = useMemo(() => {
    if (driversInScope.length === 0) return "No driver";
    if (driversInScope.length > 1) return "Multiple";
    const d = driversInScope[0]!;
    return formatDriverDisplay({
      vehicle: d.vehicle,
      rawDriver: d.name,
      missingOrdinalByVehicle,
      violations: filteredViolations,
    });
  }, [driversInScope, missingOrdinalByVehicle, filteredViolations]);

  const toSpeedNumber = (value: string) => {
    const m = String(value ?? "").match(/([0-9]+(?:\.[0-9]+)?)/);
    return m ? Number(m[1]) : 0;
  };

  const selectedDriverMetrics = useMemo(() => {
    const selectedDrivers = driversInScope;
    const totalDistance = selectedDrivers.reduce((sum, d) => sum + (d.distance ?? 0), 0);
    const totalFuelConsumed = selectedDrivers.reduce((sum, d) => sum + (d.fuelConsumed ?? 0), 0);
    const totalFuelFilled = selectedDrivers.reduce((sum, d) => sum + (d.fuelFilled ?? 0), 0);
    const totalFuelDrained = selectedDrivers.reduce((sum, d) => sum + (d.fuelDrained ?? 0), 0);
    const engineSeconds = selectedDrivers.reduce((sum, d) => sum + durationToSeconds(d.engineRunningTime), 0);
    const idlingSeconds = selectedDrivers.reduce((sum, d) => sum + durationToSeconds(d.idlingEngineTime), 0);
    const avgConsumption = selectedDrivers.length
      ? selectedDrivers.reduce((sum, d) => sum + (d.avgConsumption ?? 0), 0) / selectedDrivers.length
      : 0;

    // AVG SPEED: take average of "Avg. speed" from Reports → Speed Monitoring.
    const scopedSpeed = selectedDriverId === "ALL"
      ? speedRecords
      : speedRecords.filter((r) => selectedDrivers.some((d) => rowMatchesDriver(r.vehicle, r.driver, d)));
    const speedValues = scopedSpeed
      .map((r) => toSpeedNumber(r.avgSpeed))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgSpeed = speedValues.length
      ? speedValues.reduce((sum, n) => sum + n, 0) / speedValues.length
      : 0;

    // MAX SPEED: take maximum of "Max Speed" from Violations → Over Speeding records.
    const overSpeedingViolations = selectedDriverId === "ALL"
      ? filteredViolations.filter((v) => String(v.violation ?? "").trim() === "Over Speeding")
      : filteredViolations.filter((v) =>
        String(v.violation ?? "").trim() === "Over Speeding"
        && selectedDrivers.some((d) => rowMatchesDriver(v.vehicle, v.driver, d)),
      );
    const maxSpeed = overSpeedingViolations.reduce((m, v) => Math.max(m, toSpeedNumber(v.maxSpeed)), 0);

    const ids = [...new Set(selectedDrivers.map((d) => String(d.id ?? "").trim()).filter(Boolean))];
    return {
      id: selectedDriverId === "ALL" ? "ALL" : (ids.length === 1 ? ids[0]! : "—"),
      name: selectedDriverId === "ALL" ? "All Drivers" : displayDriverName,
      vehicle: selectedDriverId === "ALL" ? "All Vehicles" : (selectedDrivers[0]?.vehicle ?? "—"),
      distance: totalDistance,
      fuelConsumed: totalFuelConsumed,
      fuelFilled: totalFuelFilled,
      fuelDrained: totalFuelDrained,
      totalFillings: 0,
      totalDrains: 0,
      avgSpeed,
      maxSpeed,
      avgConsumption,
      engineRunningTime: secondsToDuration(engineSeconds),
      idlingEngineTime: secondsToDuration(idlingSeconds),
      propulsion: "Diesel",
      transportWorkAvg: 0,
    };
  }, [driversInScope, selectedDriverId, displayDriverName, speedRecords, filteredViolations]);

  const driverViolations = useMemo(() => {
    if (selectedDriverId === "ALL") return filteredViolations;
    return filteredViolations.filter((v) =>
      driversInScope.some((d) => d.name === v.driver && d.vehicle === v.vehicle),
    );
  }, [filteredViolations, selectedDriverId, driversInScope]);
  const totalViolationCount = useMemo(
    () => VIOLATION_TYPES.reduce(
      (sum, vt) => sum + driverViolations.filter((v) => v.violation === vt).length,
      0,
    ),
    [driverViolations],
  );
  const violationBreakdown = VIOLATION_TYPES.map((vt) => ({
    type: vt,
    count: driverViolations.filter((v) => v.violation === vt).length,
  }));
  const totalViolationRate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const vt of VIOLATION_TYPES) {
      counts[vt] = driverViolations.filter((v) => v.violation === vt).length;
    }
    return totalViolationRateFor({ distanceKm: Number(selectedDriverMetrics.distance ?? 0), counts });
  }, [driverViolations, selectedDriverMetrics.distance]);

  function parseKm(value: string) {
    const match = String(value ?? "").match(/([0-9]+(?:\.[0-9]+)?)/);
    return match ? Number(match[1]) : 0;
  }

  const diagnosticCards = useMemo(() => {
    const rows = driverViolations;
    const totalDistanceKm = Math.max(0, selectedDriverMetrics.distance ?? 0);
    const sumFor = (type: string) => {
      const inType = rows.filter((r) => String(r.violation ?? "").trim() === type);
      const seconds = inType.reduce((sum, r) => sum + durationToSeconds(r.duration), 0);
      const km = inType.reduce((sum, r) => sum + parseKm(r.mileage), 0);
      const pct = totalDistanceKm > 0 ? (km / totalDistanceKm) * 100 : 0;
      const distance = type === "Green Band Driving"
        ? `${km.toFixed(1)} km (${pct.toFixed(1)}%)`
        : `${km.toFixed(1)} km`;
      return { duration: secondsToDuration(seconds), distance };
    };
    const avgSpeedKmH = Number(selectedDriverMetrics.avgSpeed ?? 0);
    const maxSpeedKmH = Number(selectedDriverMetrics.maxSpeed ?? 0);
    return [
      { label: "Green Band Driving", ...sumFor("Green Band Driving") },
      { label: "Accelerator < 40 %", ...sumFor("Accelerator < 40 %") },
      { label: "AVG SPEED", duration: `${avgSpeedKmH.toFixed(1)} km/h`, distance: "" },
      { label: "MAX SPEED", duration: `${maxSpeedKmH.toFixed(0)} km/h`, distance: "" },
    ];
  }, [driverViolations, selectedDriverMetrics.distance, selectedDriverMetrics.avgSpeed, selectedDriverMetrics.maxSpeed]);

  const driverScores = useMemo(() => {
    const driversInScopeLocal = driversInScope;
    const distanceById = new Map<string, number>();
    for (const d of driversInScopeLocal) {
      distanceById.set(d.id, Number(d.distance ?? 0));
    }

    const countsByDriverId = new Map<string, Record<string, number>>();
    const greenKmByDriverId = new Map<string, number>();
    for (const r of driverViolations) {
      const dRow = driversInScopeLocal.find((d) => d.name === r.driver && d.vehicle === r.vehicle);
      if (!dRow) continue;
      const current = countsByDriverId.get(dRow.id) ?? {};
      current[r.violation] = (current[r.violation] ?? 0) + 1;
      countsByDriverId.set(dRow.id, current);

      if (r.violation === "Green Band Driving") {
        const km = parseKm(r.mileage);
        greenKmByDriverId.set(dRow.id, (greenKmByDriverId.get(dRow.id) ?? 0) + km);
      }
    }

    const rows = driversInScopeLocal.map((d) => {
      const counts = countsByDriverId.get(d.id) ?? {};
      const distanceKm = distanceById.get(d.id) ?? 0;
      const greenBandKm = greenKmByDriverId.get(d.id) ?? 0;
      const greenBandPct = distanceKm > 0 ? (greenBandKm / distanceKm) * 100 : 0;
      const totalViolationRate = totalViolationRateFor({ distanceKm, counts });
      const totalViolationCount = VIOLATION_TYPES.reduce((sum, vt) => sum + (counts[vt] ?? 0), 0);
      const { score, grade } = computeDriverScore({ greenBandPct, totalViolationRate });
      const denom = Math.max(1, distanceKm || 0);
      const per100 = (count: number) => (count / denom) * 100;
      return {
        driver: d.name,
        driverLabel: formatDriverDisplay({
          vehicle: d.vehicle,
          rawDriver: d.name,
          missingOrdinalByVehicle,
          violations: filteredViolations,
        }),
        vehicle: d.vehicle,
        distanceKm,
        greenBandKm,
        greenBandPct,
        totalRate: totalViolationRate,
        totalCount: totalViolationCount,
        score,
        grade,
        counts,
        rates: Object.fromEntries(VIOLATION_TYPES.map((vt) => [vt, per100(counts[vt] ?? 0)])) as Record<string, number>,
      };
    });

    return rows.sort((a, b) => b.score - a.score || b.distanceKm - a.distanceKm);
  }, [driversInScope, driverViolations, missingOrdinalByVehicle, filteredViolations]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(driverScores.length / pageSize));
  const pagedScoreRows = driverScores.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const downloadScoresPdf = () => {
    const head = [
      [
        "Driver",
        "Vehicle",
        "Distance (km)",
        "Score",
        "Grade",
        "Green Band Driving",
        "Total Violations",
        ...VIOLATION_TYPES.map((v) => `${v} (#/100km)`),
      ],
    ];
    const body = driverScores.map((r) => [
      r.driverLabel,
      r.vehicle,
      Number(r.distanceKm ?? 0).toFixed(2),
      r.score.toFixed(0),
      r.grade,
      `${(r.greenBandPct ?? 0).toFixed(1)}% (${Number(r.greenBandKm ?? 0).toFixed(1)} km)`,
      r.totalCount ?? 0,
      ...VIOLATION_TYPES.map(
        (vt) => `${r.counts[vt] ?? 0} (${(r.rates[vt] ?? 0).toFixed(2)})`,
      ),
    ]);
    downloadPdfTable({
      title: "Driver scoring",
      head,
      body,
      fileName: `driver_scoring_${new Date().toISOString().slice(0, 10)}.pdf`,
      landscape: true,
    });
  };

  const downloadScoresXlsx = () => {
    const sheetRows = driverScores.map((r) => {
      const base: Record<string, string | number> = {
        Driver: r.driverLabel,
        Vehicle: r.vehicle,
        "Distance (km)": Number(Number(r.distanceKm ?? 0).toFixed(2)),
        Score: Number(r.score.toFixed(0)),
        Grade: r.grade,
        "Green Band Driving %": Number((r.greenBandPct ?? 0).toFixed(1)),
        "Green Band Driving (km)": Number((r.greenBandKm ?? 0).toFixed(1)),
        "Total Violations (count)": r.totalCount ?? 0,
      };
      for (const v of VIOLATION_TYPES) {
        base[`${v} (count)`] = r.counts[v] ?? 0;
        base[`${v} (#/100km)`] = Number((r.rates[v] ?? 0).toFixed(2));
      }
      return base;
    });
    const sheet = XLSX.utils.json_to_sheet(sheetRows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Driver Scoring");
    XLSX.writeFile(book, `driver_scoring_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow)",
  };

  const violationChartMinW = Math.max(280, violationBreakdown.length * 56);

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "auto", overflowY: "visible" }}>
      <PageHeader
        title="Driver"
        titleAccent="Evaluation"
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
      <div
        style={{
          marginTop: 4,
          marginBottom: 18,
          display: "flex",
          flexDirection: narrow ? "column" : "row",
          alignItems: narrow ? "stretch" : "center",
          gap: narrow ? 8 : 10,
          flexWrap: "wrap",
          maxWidth: "100%",
        }}
      >
        <span
          style={{
            fontSize: ".72rem",
            color: "#000000",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: ".06em",
            flexShrink: 0,
          }}
        >
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
            minWidth: narrow ? 0 : 190,
            width: narrow ? "100%" : "min(100%, 360px)",
            maxWidth: 420,
          }}
        >
          <option value="ALL">All Drivers</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {formatDriverDisplay({
                vehicle: d.vehicle,
                rawDriver: d.name,
                missingOrdinalByVehicle,
                violations: filteredViolations,
              })}
            </option>
          ))}
        </select>
      </div>
      {error && <p style={{ color: "var(--red)", marginBottom: 12, fontSize: ".82rem" }}>{error}</p>}

      <div
        style={{
          display: "flex",
          flexDirection: narrow ? "column" : "row",
          gap: "20px",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            width: narrow ? "min(168px, 100%)" : 168,
            height: 168,
            maxWidth: "100%",
            flexShrink: 0,
            ...card,
            padding: "12px 10px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "stretch",
            background: "linear-gradient(180deg, #ffffff 0%, #f4f8ff 100%)",
            border: "1px solid #dbe7ff",
            boxSizing: "border-box",
            overflow: "hidden",
            marginLeft: narrow ? "auto" : undefined,
            marginRight: narrow ? "auto" : undefined,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6, minWidth: 0 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "linear-gradient(135deg, #2f6fed, #5a8dff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 800,
                fontSize: "1rem",
                fontFamily: "var(--font-body)",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(47,111,237,.28)",
              }}
              aria-hidden
            >
              {(selectedDriverMetrics?.name ?? "?").charAt(0).toUpperCase()}
            </div>
            <h3
              style={{
                fontSize: ".72rem",
                fontWeight: 800,
                color: "var(--text)",
                lineHeight: 1.2,
                margin: 0,
                maxWidth: "100%",
                wordBreak: "break-word",
              }}
            >
              {selectedDriverMetrics?.name ?? "No Driver"}
            </h3>
            <p
              style={{
                fontSize: ".58rem",
                color: "var(--text2)",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                margin: 0,
                letterSpacing: ".02em",
              }}
            >
              ID: {selectedDriverMetrics?.id ?? "-"}
            </p>
          </div>

          <div
            style={{
              background: "var(--surface2)",
              border: "1px solid #d4def5",
              borderRadius: 10,
              padding: "8px 8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 2,
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--blue)" }}>
              <BusFront size={12} strokeWidth={2.4} aria-hidden />
              <span style={{ fontSize: ".52rem", color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>
                Vehicle
              </span>
            </div>
            <p
              style={{
                fontWeight: 800,
                fontSize: ".68rem",
                color: "var(--text)",
                margin: 0,
                lineHeight: 1.2,
                wordBreak: "break-word",
                maxWidth: "100%",
              }}
            >
              {selectedDriverMetrics?.vehicle ?? "-"}
            </p>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: narrow ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(140px, 1fr))",
              gap: "12px",
            }}
          >
            {[
              { label: "Total Violations", value: (totalViolationCount ?? 0).toLocaleString() },
              { label: "Distance", value: `${selectedDriverMetrics?.distance?.toLocaleString() ?? 0} km` },
              { label: "Engine Hours", value: selectedDriverMetrics?.engineRunningTime ?? "-" },
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

          <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2, minmax(0, 1fr))" : "repeat(4, 1fr)", gap: "12px" }}>
            {[
              { type: "metric" as const, label: "Avg Consumption", value: `${selectedDriverMetrics?.avgConsumption?.toFixed(2) ?? 0} km/L` },
              { type: "metric" as const, label: "Total Fuel Filled", value: `${selectedDriverMetrics?.fuelFilled ?? 0} L` },
              { type: "metric" as const, label: "Total Fuel Drained", value: `${selectedDriverMetrics?.fuelDrained ?? 0} L` },
              { type: "metric" as const, label: "Fuel Consumed", value: `${selectedDriverMetrics?.fuelConsumed ?? 0} L` },
              ...diagnosticCards.map((c) => ({ type: "diagnostic" as const, label: c.label, duration: c.duration, distance: c.distance })),
            ].map((m, idx) => (
              <div key={m.label} style={{ ...card, padding: "14px", position: "relative", overflow: "hidden" }}>
                {"type" in m && m.type === "diagnostic" && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${["#10b981", "#3b82f6", "#f59e0b", "#ef4444"][idx % 4]}, transparent)` }} />
                )}
                <p style={{ fontSize: ".68rem", color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800, marginBottom: "6px" }}>{m.label}</p>
                {"type" in m && m.type === "diagnostic" ? (
                  <div style={{ display: "grid", gap: 4 }}>
                    <p style={{ fontSize: "1.05rem", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text)", lineHeight: 1.15, margin: 0 }}>
                      {m.duration}
                    </p>
                    <p style={{ fontSize: ".9rem", fontWeight: 800, fontFamily: "var(--font-body)", color: "var(--text2)", margin: 0 }}>
                      {m.distance}
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: "1.05rem", fontWeight: 400, fontFamily: "var(--font-body)", color: "var(--text)" }}>
                    {"value" in m ? m.value : ""}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-body)", fontSize: ".8rem", fontWeight: 700, color: "var(--text)" }}>
              Violation Breakdown
            </div>
            <div className="tab-chart-scroll tab-chart-scroll--dashboard-chart" style={{ width: "100%", minWidth: 0 }}>
              <div style={{ height: narrow ? 280 : 300, padding: "10px 14px 4px", minWidth: violationChartMinW, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} debounce={80}>
                  <BarChart data={violationBreakdown} margin={{ top: 8, right: 8, left: 0, bottom: 52 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5ecff" />
                    <XAxis
                      dataKey="type"
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
                    <Bar
                      dataKey="count"
                      radius={[6, 6, 0, 0]}
                      onClick={() => {
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
      </div>

      <div style={{ marginTop: "16px", ...card, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: ".86rem", color: "var(--text)" }}>
            Driver Scoring
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={downloadScoresPdf}
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
              Download PDF
            </button>
            <button
              onClick={downloadScoresXlsx}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(22,163,74,0.35)",
                background: "rgba(22,163,74,0.1)",
                color: "#15803d",
                fontWeight: 700,
                fontSize: ".76rem",
                cursor: "pointer",
              }}
            >
              Download XLSX
            </button>
          </div>
        </div>
        <div className="data-table-scroll" style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem", minWidth: 1200 }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border2)" }}>
                {[
                  "#",
                  "Driver",
                  "Vehicle",
                  "Distance (km)",
                  "Score",
                  "Grade",
                  "Green Band Driving",
                  "Total Violations",
                  ...VIOLATION_TYPES.map((v) => `${v} (#/100km)`),
                ].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: h.includes("(km)") || h.includes("Score") || h.includes("Total") || h.includes("#/100") ? "right" : "left", fontSize: ".68rem", fontWeight: 800, color: "#000000", textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedScoreRows.length === 0 ? (
                <tr>
                  <td colSpan={8 + VIOLATION_TYPES.length} style={{ padding: "20px", textAlign: "center", color: "var(--text3)" }}>
                    No driver scoring data available for this selection.
                  </td>
                </tr>
              ) : (
                pagedScoreRows.map((r, idx) => (
                  <tr key={`${r.driver}-${r.vehicle}-${idx}`} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px" }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 800 }}>{r.driverLabel}</td>
                    <td style={{ padding: "10px 12px" }}>{r.vehicle}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{Number(r.distanceKm ?? 0).toFixed(2)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: r.score >= 85 ? "var(--green)" : r.score >= 70 ? "#8a5a00" : "var(--red)" }}>{r.score.toFixed(0)}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 900 }}>{r.grade}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800 }}>{(r.greenBandPct ?? 0).toFixed(1)}%</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800 }}>{r.totalCount ?? 0}</td>
                    {VIOLATION_TYPES.map((vt) => (
                      <td key={vt} style={{ padding: "10px 12px", textAlign: "right" }}>
                        {(r.counts[vt] ?? 0)} ({(r.rates[vt] ?? 0).toFixed(2)})
                      </td>
                    ))}
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



import { NextResponse } from "next/server";
import {
  VIOLATION_TYPES,
  type Driver,
  type FinalReportRow,
  type FuelRecord,
  type SpeedRecord,
  type VehiclePerformance,
  type ViolationRecord,
  type WialonDataset,
} from "@/lib/data";

const API_URL = "https://hst-api.wialon.com/wialon/ajax.html";
const REPORT_RESOURCE_ID = 17082202;
const REPORT_TEMPLATE_ID = 220;
const REPORT_OBJECT_ID = 30182477;

const DIAGNOSTIC_TYPES = [
  "Accelerator < 40 %",
  "Green Band Driving",
  "Accelerator > 70%",
  "Engine Stress",
  "Engine Temp >105°",
] as const;

const ECODRIVING_ALLOWED_TYPES = new Set<string>([...VIOLATION_TYPES, ...DIAGNOSTIC_TYPES]);

function normalizeEcoDrivingViolation(value: string) {
  const normalized = String(value ?? "").trim();
  const comparable = normalized.toLowerCase().replace(/[\s_-]+/g, "");
  if (comparable === "freewheeling" || comparable === "freewheelingserverside") {
    return "Free Wheeling";
  }
  return normalized;
}

function decodeHtmlEntities(value: string) {
  return String(value ?? "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function toNumber(value: unknown): number {
  const match = String(value ?? "").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : 0;
}

function durationToSeconds(value: string): number {
  const normalized = String(value ?? "").trim();
  if (!normalized) return 0;
  const dayMatch = normalized.match(/(\d+)\s+days?/i);
  const days = dayMatch ? Number(dayMatch[1]) : 0;
  const timeMatch = normalized.match(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})/);
  const timePart = timeMatch ? timeMatch[1] : normalized;
  const parts = timePart.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) return (days * 86400) + (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (days * 86400) + (parts[0] * 60) + parts[1];
  if (parts.length === 1) return (days * 86400) + parts[0];
  return 0;
}

function splitGrouping(grouping: string) {
  const parts = grouping
    .split(" - ")
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);

  // In this report template, the "Grouping" cell often encodes unit grouping like:
  // - Old: "ENA COACH - KDE 181Q"
  // - New: "ENA - KDE 181Q - FMC150"
  //
  // We want the vehicle registration (middle segment when present).
  const left = String(parts[0] ?? "").trim();
  const vehicle = String(parts[1] ?? parts[0] ?? "").trim();
  const driver = "";
  return { vehicle, driver };
}

type RawCell = string | { t?: string; x?: number; y?: number };
type RawRow = { c?: RawCell[] };

function toRows(payload: unknown): RawRow[] {
  return Array.isArray(payload) ? (payload as RawRow[]) : [];
}

function cellText(cell: RawCell | undefined) {
  if (typeof cell === "string") return cell;
  return String(cell?.t ?? "");
}

function cellCoords(cell: RawCell | undefined) {
  if (!cell || typeof cell === "string") return "";
  if (typeof cell.x === "number" && typeof cell.y === "number") {
    return `${cell.y},${cell.x}`;
  }
  return "";
}

// Always treat naked datetime strings (e.g. "2026-05-12T06:20" from a
// <input type="datetime-local">) as Kenya time (EAT, UTC+3). Without this,
// `new Date(...)` would parse them in the server's local timezone — which is
// UTC on Vercel and EAT in local Windows dev — causing the displayed times
// to drift by 3 hours in production.
function parseKenyaDateTime(input: string): number {
  const raw = String(input ?? "").trim();
  if (!raw) return NaN;
  // If the caller already specified a timezone (Z or ±HH:MM/±HHMM), trust it.
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw)) {
    return new Date(raw).getTime();
  }
  // Otherwise, anchor to Kenya time. Ensure seconds are present so the
  // resulting string is a valid ISO 8601 datetime.
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00` : raw;
  return new Date(`${withSeconds}+03:00`).getTime();
}

function shiftWialonDateTime(value: string, hoursToAdd = 3) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-----") return raw;
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return raw;
  const dd = Number(match[1]);
  const mm = Number(match[2]);
  const yyyy = Number(match[3]);
  const hh = Number(match[4] ?? 0);
  const min = Number(match[5] ?? 0);
  const ss = Number(match[6] ?? 0);
  const dt = new Date(yyyy, mm - 1, dd, hh, min, ss);
  if (Number.isNaN(dt.getTime())) return raw;
  dt.setHours(dt.getHours() + hoursToAdd);
  const outDd = String(dt.getDate()).padStart(2, "0");
  const outMm = String(dt.getMonth() + 1).padStart(2, "0");
  const outYy = dt.getFullYear();
  const outHh = String(dt.getHours()).padStart(2, "0");
  const outMin = String(dt.getMinutes()).padStart(2, "0");
  const outSs = String(dt.getSeconds()).padStart(2, "0");
  return `${outDd}.${outMm}.${outYy} ${outHh}:${outMin}:${outSs}`;
}

function maybeShiftByHeader(header: string, value: string) {
  const h = String(header ?? "").toLowerCase();
  const v = String(value ?? "").trim();
  // Only shift real timestamps (dd.mm.yyyy hh:mm[:ss]) and avoid durations like "5 days 01:02:03".
  if (/\bdays?\b/i.test(v)) return value;
  if (h.includes("time") || h.includes("date")) {
    return shiftWialonDateTime(value, 3);
  }
  return value;
}

async function fetchTableRows(tableIndex: number, rowCount: number, sid: string) {
  const rows = await callWialon<unknown>(
    "report/get_result_rows",
    { tableIndex, indexFrom: 0, indexTo: Math.max(rowCount - 1, 0) },
    sid,
  );
  return toRows(rows);
}

async function fetchTableSubrows(tableIndex: number, parentRowCount: number, sid: string) {
  const all: RawRow[] = [];
  for (let rowIndex = 0; rowIndex < parentRowCount; rowIndex += 1) {
    const subRows = await callWialon<unknown>(
      "report/get_result_subrows",
      { tableIndex, rowIndex, colIndex: 0, indexFrom: 0, indexTo: 1000 },
      sid,
    );
    all.push(...toRows(subRows));
  }
  return all;
}

function pickColumnIndex(headers: string[], regex: RegExp) {
  return headers.findIndex((h) => regex.test(String(h).toLowerCase()));
}

function pickAny(headers: string[], patterns: RegExp[]) {
  for (const p of patterns) {
    const idx = pickColumnIndex(headers, p);
    if (idx >= 0) return idx;
  }
  return -1;
}

function sumFuelByVehicle(
  records: FuelRecord[],
  opts: { valueKey: RegExp; vehicleKey?: RegExp },
) {
  const totalLitres = new Map<string, number>();
  const count = new Map<string, number>();

  for (const r of records) {
    const vehicle = String(r.vehicle ?? "").trim();
    if (!vehicle) continue;

    const keys = Object.keys(r.columns ?? {});
    const valueCol = keys.find((k) => opts.valueKey.test(k.toLowerCase()));
    const raw = valueCol ? r.columns[valueCol] : "";
    const litres = toNumber(raw);
    if (!(litres > 0)) continue;

    totalLitres.set(vehicle, (totalLitres.get(vehicle) ?? 0) + litres);
    count.set(vehicle, (count.get(vehicle) ?? 0) + 1);
  }

  return { totalLitres, count };
}

function kmPerLFromAbsFcsLPer100Km(raw: string) {
  const lPer100 = toNumber(raw);
  if (!(lPer100 > 0)) return 0;
  return 100 / lPer100;
}

function rowsToFuelRecords(
  tableHeaders: string[],
  rows: RawRow[],
  baseId: number,
): FuelRecord[] {
  const groupingIdx = pickColumnIndex(tableHeaders, /group/);
  const locationIdx = pickColumnIndex(tableHeaders, /location|address|place/);
  const driverIdx = pickColumnIndex(tableHeaders, /driver/);

  return rows.map((row, index) => {
    const cells = row.c ?? [];
    const grouping = groupingIdx >= 0 ? cellText(cells[groupingIdx]) : cellText(cells[0]);
    const { driver, vehicle } = splitGrouping(grouping);
    const location = locationIdx >= 0 ? cellText(cells[locationIdx]) : "";
    const locationCoords = locationIdx >= 0 ? cellCoords(cells[locationIdx]) : "";
    const columns: Record<string, string> = {};
    for (let i = 0; i < tableHeaders.length; i += 1) {
      const key = String(tableHeaders[i] ?? "").trim();
      if (!key) continue;
      columns[key] = maybeShiftByHeader(key, cellText(cells[i]));
    }
    return {
      id: baseId + index + 1,
      grouping: vehicle || grouping,
      driver: driverIdx >= 0 ? cellText(cells[driverIdx]) || driver || "Missing" : (driver || "Missing"),
      vehicle,
      location,
      locationCoords,
      columns,
    };
  });
}

async function callWialon<T>(svc: string, params: object, sid: string) {
  const body = new URLSearchParams({
    svc,
    params: JSON.stringify(params),
    sid,
  });
  const response = await fetch(API_URL, {
    method: "POST",
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Track3 Database request failed (status ${response.status}).`);
  }
  const payload = (await response.json()) as { error?: number; reason?: string } | T;
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const errPayload = payload as { error?: number; reason?: string };
    if (typeof errPayload.error === "number" && errPayload.error !== 0) {
      throw new Error(
        `Track3 Database error ${String(errPayload.error)}${errPayload.reason ? `: ${errPayload.reason}` : ""}`,
      );
    }
  }
  return payload as T;
}

function rowsToSpeedRecords(
  tableHeaders: string[],
  rows: RawRow[],
  baseId: number,
): SpeedRecord[] {
  // Notebook/Wialon columns:
  // Grouping | Driver | Initial location | Final location | Mileage | Avg. speed | Duration
  const groupingIdx = pickColumnIndex(tableHeaders, /group/);
  const driverIdx = pickColumnIndex(tableHeaders, /driver/);
  const initialIdx = pickColumnIndex(tableHeaders, /initial.*location|start.*location|from|initial/);
  const finalIdx = pickColumnIndex(tableHeaders, /final.*location|end.*location|to|final/);
  const mileageIdx = pickColumnIndex(tableHeaders, /mileage|distance/);
  const avgSpeedIdx = pickColumnIndex(tableHeaders, /avg.*speed/);
  const durationIdx = pickColumnIndex(tableHeaders, /duration/);

  return rows.map((row, index) => {
    const cells = row.c ?? [];
    const grouping = groupingIdx >= 0 ? cellText(cells[groupingIdx]) : cellText(cells[0]);
    const parsed = splitGrouping(grouping);
    const driverCell = driverIdx >= 0 ? cellText(cells[driverIdx]) : "";
    const driver = (driverCell || parsed.driver || "").trim();
    const vehicle = (parsed.vehicle || "").trim();
    const initialLocation = initialIdx >= 0 ? cellText(cells[initialIdx]) : "";
    const finalLocation = finalIdx >= 0 ? cellText(cells[finalIdx]) : "";
    const initialLocationCoords = initialIdx >= 0 ? cellCoords(cells[initialIdx]) : "";
    const finalLocationCoords = finalIdx >= 0 ? cellCoords(cells[finalIdx]) : "";

    return {
      id: baseId + index + 1,
      grouping,
      driver,
      vehicle,
      initialLocation,
      initialLocationCoords,
      finalLocation,
      finalLocationCoords,
      mileage: mileageIdx >= 0 ? cellText(cells[mileageIdx]) : "",
      avgSpeed: avgSpeedIdx >= 0 ? cellText(cells[avgSpeedIdx]) : "",
      duration: durationIdx >= 0 ? cellText(cells[durationIdx]) : "",
    };
  });
}

export async function GET(request: Request) {
  try {
    const token = process.env.WIALON_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Track3 Database access token is not configured on the server." },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);
    const fromISO = searchParams.get("from");
    const toISO = searchParams.get("to");
    if (!fromISO || !toISO) {
      return NextResponse.json({ error: "Missing from/to query parameters." }, { status: 400 });
    }

    const from = Math.floor(parseKenyaDateTime(fromISO) / 1000);
    const to = Math.floor(parseKenyaDateTime(toISO) / 1000);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      return NextResponse.json(
        { error: "Invalid from/to date range. Use valid ISO datetimes (from < to)." },
        { status: 400 },
      );
    }

    const loginResponse = await fetch(
      `${API_URL}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`,
      { method: "POST", cache: "no-store" },
    );
    if (!loginResponse.ok) {
      throw new Error(
        `Track3 Database authentication failed (status ${loginResponse.status}).`,
      );
    }
    const login = (await loginResponse.json()) as { eid?: string; error?: number; reason?: string };
    if (typeof login.error === "number") {
      throw new Error(
        `Track3 Database authentication error ${login.error}${login.reason ? `: ${login.reason}` : ""}`,
      );
    }
    const sid = login.eid;
    if (typeof sid !== "string" || !sid) {
      throw new Error("Track3 Database authentication failed.");
    }

    const exec = await callWialon<{ reportResult?: { tables?: Array<{ header?: string[]; rows?: number }> } }>(
      "report/exec_report",
      {
        reportResourceId: REPORT_RESOURCE_ID,
        reportTemplateId: REPORT_TEMPLATE_ID,
        reportObjectId: REPORT_OBJECT_ID,
        reportObjectSecId: 0,
        interval: { flags: 0, from, to },
      },
      sid,
    );

    const tables = exec.reportResult?.tables ?? [];
    const summaryRowsCount = tables[0]?.rows ?? 0;
    const ecoRowsCount = tables[1]?.rows ?? 0;
    const locationRowsCount = tables[2]?.rows ?? 0;
    const idlingTable = tables[5];
    const idlingRowsCount = idlingTable?.rows ?? 0;

    const summaryRows = await fetchTableRows(0, summaryRowsCount, sid);
    const locationRows = await fetchTableRows(2, locationRowsCount, sid);
    const idlingRows = idlingTable && idlingRowsCount > 0
      ? await fetchTableRows(5, idlingRowsCount, sid)
      : [];

    const idlingByVehicle = new Map<string, string>();
    for (const row of idlingRows) {
      const cells = row.c ?? [];
      const grouping = cellText(cells[0]);
      const { vehicle } = splitGrouping(grouping);
      const idlingValue = cellText(cells[5]);
      if (vehicle && idlingValue) {
        idlingByVehicle.set(vehicle, idlingValue);
      }
    }

    // Fuel tables (fillings/drains) — same indices as enacoach.ipynb: table 3 = fillings, 4 = drains.
    // Do NOT detailize every table from index 3 upward (that hits idling/speed/etc. and can break Wialon or time out).
    const FUEL_FILLINGS_TABLE_INDEX = 3;
    const FUEL_DRAINS_TABLE_INDEX = 4;

    const detail_ena_coach_fillings: FuelRecord[] = [];
    const detail_ena_coach_drains: FuelRecord[] = [];
    let fuelIdBase = 0;

    async function loadFuelDetailTable(tableIndex: number, sessionId: string): Promise<FuelRecord[]> {
      const table = tables[tableIndex];
      const rowsCount = table?.rows ?? 0;
      if (!rowsCount) return [];
      let rows = await fetchTableSubrows(tableIndex, rowsCount, sessionId);
      if (!rows.length) {
        rows = await fetchTableRows(tableIndex, rowsCount, sessionId);
      }
      const mapped = rowsToFuelRecords(table?.header ?? [], rows, fuelIdBase);
      fuelIdBase += mapped.length;
      return mapped;
    }

    if (tables.length > FUEL_FILLINGS_TABLE_INDEX) {
      detail_ena_coach_fillings.push(...(await loadFuelDetailTable(FUEL_FILLINGS_TABLE_INDEX, sid)));
    }
    if (tables.length > FUEL_DRAINS_TABLE_INDEX) {
      detail_ena_coach_drains.push(...(await loadFuelDetailTable(FUEL_DRAINS_TABLE_INDEX, sid)));
    }

    const fillingsAgg = sumFuelByVehicle(detail_ena_coach_fillings, { valueKey: /filled\b/i });
    const drainsAgg = sumFuelByVehicle(detail_ena_coach_drains, { valueKey: /drained\b/i });

    const driverByVehicle = new Map<string, string>();
    for (const row of locationRows) {
      const cells = row.c ?? [];
      const grouping = cellText(cells[0]);
      const { vehicle } = splitGrouping(grouping);
      const driverName = String(cellText(cells[4]) ?? "").trim();
      if (vehicle && driverName && driverName !== "-----" && driverName !== "—") {
        driverByVehicle.set(vehicle, driverName);
      }
    }

    const resolveDriver = (vehicle: string, rawName?: string) => {
      const normalized = String(rawName ?? "").trim();
      if (normalized && normalized !== "-----" && normalized !== "—") return normalized;
      return driverByVehicle.get(vehicle) ?? "Missing";
    };

    const summaryHeaders = tables[0]?.header ?? [];
    const idxGrouping = pickAny(summaryHeaders, [/group/]);
    const idxMileage = pickAny(summaryHeaders, [/mileage in all messages|mileage|distance/]);
    const idxAvgSpeed = pickAny(summaryHeaders, [/avg\.?\s*speed/]);
    const idxMaxSpeed = pickAny(summaryHeaders, [/max\.?\s*speed/]);
    const idxEngineHours = pickAny(summaryHeaders, [/engine hours|engine time|engine running time/]);
    const idxAbsFcsConsumption = pickAny(summaryHeaders, [/avg\.?\s*consumption by absfcs/]);
    const idxFuelConsumed = pickAny(summaryHeaders, [/consumed by absfcs|fuel consumed|consumed/]);

    const drivers: Driver[] = summaryRows.map((row, index) => {
      const cells = row.c ?? [];
      const grouping = cellText(cells[idxGrouping >= 0 ? idxGrouping : 0]);
      const { vehicle } = splitGrouping(grouping);
      const driver = resolveDriver(vehicle, driverByVehicle.get(vehicle));
      const engineHoursRaw = cellText(cells[idxEngineHours >= 0 ? idxEngineHours : 4]) || "N/A";
      const absFcsConsumptionRaw = cellText(cells[idxAbsFcsConsumption >= 0 ? idxAbsFcsConsumption : 0]);
      const avgConsumptionKmPerL = kmPerLFromAbsFcsLPer100Km(absFcsConsumptionRaw);
      return {
        id: `D${String(index + 1).padStart(3, "0")}`,
        name: driver,
        vehicle,
        distance: toNumber(cellText(cells[idxMileage >= 0 ? idxMileage : 1])),
        avgSpeed: toNumber(cellText(cells[idxAvgSpeed >= 0 ? idxAvgSpeed : 2])),
        maxSpeed: toNumber(cellText(cells[idxMaxSpeed >= 0 ? idxMaxSpeed : 3])),
        engineRunningTime: engineHoursRaw,
        idlingEngineTime: idlingByVehicle.get(vehicle) ?? "00:00:00",
        avgConsumption: avgConsumptionKmPerL,
        totalFillings: fillingsAgg.count.get(vehicle) ?? 0,
        totalDrains: drainsAgg.count.get(vehicle) ?? 0,
        fuelFilled: fillingsAgg.totalLitres.get(vehicle) ?? 0,
        fuelDrained: drainsAgg.totalLitres.get(vehicle) ?? 0,
        fuelConsumed: toNumber(cellText(cells[idxFuelConsumed >= 0 ? idxFuelConsumed : 10])),
        propulsion: "Diesel",
        transportWorkAvg: 0,
      };
    });

    const violations: ViolationRecord[] = [];
    for (let rowIndex = 0; rowIndex < ecoRowsCount; rowIndex += 1) {
      const subRows = await callWialon<unknown>(
        "report/get_result_subrows",
        { tableIndex: 1, rowIndex, colIndex: 0, indexFrom: 0, indexTo: 1000 },
        sid,
      );

      for (const detail of toRows(subRows)) {
        const cells = detail.c ?? [];
        const grouping = cellText(cells[1]);
        const { vehicle } = splitGrouping(grouping);
        const driver = resolveDriver(vehicle, driverByVehicle.get(vehicle));
        const violation = decodeHtmlEntities(cellText(cells[2]));
        const normalizedViolation = normalizeEcoDrivingViolation(violation);
        if (!ECODRIVING_ALLOWED_TYPES.has(normalizedViolation)) continue;
        violations.push({
          id: violations.length + 1,
          grouping,
          driver,
          vehicle,
          violation: normalizedViolation,
          beginning: shiftWialonDateTime(cellText(cells[3]), 3),
          initialLocation: cellText(cells[4]),
          initialLocationCoords: cellCoords(cells[4]),
          end: shiftWialonDateTime(cellText(cells[5]), 3),
          finalLocation: cellText(cells[6]),
          finalLocationCoords: cellCoords(cells[6]),
          avgSpeed: cellText(cells[7]),
          maxSpeed: cellText(cells[8]),
          duration: cellText(cells[9]),
          mileage: cellText(cells[10]),
          count: toNumber(cellText(cells[11])) || 1,
        });
      }
    }

    const vehiclePerformance: VehiclePerformance[] = drivers.map((driver) => ({
      vehicle: driver.vehicle,
      distanceKm: driver.distance,
      consumptionLitres: driver.fuelConsumed,
      consumptionKmPerL: driver.avgConsumption,
      consumptionDrivingLitres: driver.fuelConsumed,
      consumptionDrivingKmPerL: driver.avgConsumption,
      consumptionIdleLitres: driver.fuelDrained,
      consumptionIdleKmPerL: driver.avgConsumption,
      consumptionIdleLitres2: 0,
      drivers: [
        {
          driverId: driver.id,
          driverName: driver.name,
          distanceKm: driver.distance,
          consumptionLitres: driver.fuelConsumed,
          consumptionKmPerL: driver.avgConsumption,
          consumptionDrivingLitres: driver.fuelConsumed,
          consumptionDrivingKmPerL: driver.avgConsumption,
          consumptionIdleLitres: driver.fuelDrained,
          consumptionIdleKmPerL: driver.avgConsumption,
          consumptionIdleLitres2: 0,
        },
      ],
    }));

    const finalReport: FinalReportRow[] = drivers.map((driver) => {
      const driverViolations = violations.filter((v) => v.driver === driver.name);
      const harshBrakeQty = driverViolations.filter((v) => v.violation === "Harsh Braking").length;
      const overspeedingIncidents = driverViolations.filter((v) => v.violation === "Over Speeding").length;
      const freewheeling = driverViolations.filter((v) => v.violation === "Free Wheeling").length;
      const freewheelCoastingKm = driverViolations
        .filter((v) => v.violation === "Free Wheeling")
        .reduce((total, row) => total + toNumber(row.mileage), 0);
      const brakeAppsPer100 = driver.distance > 0 ? (harshBrakeQty / driver.distance) * 100 : 0;
      const engineRunningSeconds = durationToSeconds(driver.engineRunningTime);
      const idlingSeconds = durationToSeconds(driver.idlingEngineTime ?? "00:00:00");
      const overSpeedingSeconds = driverViolations
        .filter((v) => v.violation === "Over Speeding")
        .reduce((total, row) => total + durationToSeconds(row.duration), 0);
      const idlingPercent = engineRunningSeconds > 0 ? (idlingSeconds / engineRunningSeconds) * 100 : 0;
      const engineOverspeedPercent = engineRunningSeconds > 0 ? (overSpeedingSeconds / engineRunningSeconds) * 100 : 0;
      const fuelConsumptionIdlingDiesel = engineRunningSeconds > 0
        ? (driver.fuelConsumed * idlingSeconds) / engineRunningSeconds
        : 0;
      return {
        driver: driver.name,
        vehicle: driver.vehicle,
        avgFuelConsumption: driver.avgConsumption,
        distanceKm: driver.distance,
        engineRunningTime: driver.engineRunningTime,
        idlingEngineTime: driver.idlingEngineTime ?? "00:00:00",
        brakeAppsPer100,
        harshBrakePer100: brakeAppsPer100,
        harshAccelPer100: null,
        idlingPercent,
        engineOverspeedPercent,
        powertrainCoastingPercent: null,
        fuelConsumptionDiesel: driver.fuelConsumed,
        fuelConsumptionIdlingDiesel,
        engineRunningTimeIdling: driver.idlingEngineTime ?? "00:00:00",
        avgWeightTonnes: null,
        avgSpeedKmH: driver.avgSpeed,
        freewheelCoastingKm,
        brakeAppsQty: harshBrakeQty,
        harshBrakeQty,
        overspeedingIncidents,
        totalFillings: driver.totalFillings,
        fuelDrains: driver.totalDrains,
        freewheeling,
      };
    });

    const speed: SpeedRecord[] = [];
    const speedTable = tables[6];
    const speedRowsCount = speedTable?.rows ?? 0;
    if (speedTable && speedRowsCount > 0) {
      // Detailization flow like notebook: fetch subrows per parent row.
      let rows = await fetchTableSubrows(6, speedRowsCount, sid);
      if (!rows.length) {
        rows = await fetchTableRows(6, speedRowsCount, sid);
      }
      const mapped = rowsToSpeedRecords(speedTable.header ?? [], rows, 0);
      speed.push(...mapped);
    }

    const vehicleLocations = locationRows.map((row) => {
      const cells = row.c ?? [];
      const grouping = cellText(cells[0]);
      const { vehicle } = splitGrouping(grouping);
      const lastMessageTime = shiftWialonDateTime(cellText(cells[1]), 3);
      const lastCoordinatesTime = shiftWialonDateTime(cellText(cells[2]), 3);
      const location = cellText(cells[3]);
      const locationCoords = cellCoords(cells[3]);
      const dfDriver = resolveDriver(vehicle, String(cellText(cells[4]) || "").trim());
      return {
        vehicle,
        driver: dfDriver,
        lastMessageTime,
        lastCoordinatesTime,
        location,
        locationCoords,
      };
    });

    const payload: WialonDataset = {
      drivers,
      violations,
      speed,
      vehiclePerformance,
      finalReport,
      vehicleLocations,
      fuelFillings: detail_ena_coach_fillings,
      fuelDrains: detail_ena_coach_drains,
      fetchedAt: new Date().toISOString(),
    };

    await callWialon("core/logout", {}, sid).catch(() => undefined);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "";
    const safeMessage =
      rawMessage && rawMessage.trim().length > 0
        ? rawMessage.replace(/wialon/gi, "Track3 Database")
        : "Unknown Track3 Database error.";
    console.error("[api/track3/report]", safeMessage);
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}

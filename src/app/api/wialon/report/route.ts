import { NextResponse } from "next/server";
import {
  DRIVER_MAP,
  VIOLATION_TYPES,
  type Driver,
  type FinalReportRow,
  type FuelRecord,
  type VehiclePerformance,
  type ViolationRecord,
  type WialonDataset,
} from "@/lib/data";

const API_URL = "https://hst-api.wialon.com/wialon/ajax.html";
const REPORT_RESOURCE_ID = 17082202;
const REPORT_TEMPLATE_ID = 220;
const REPORT_OBJECT_ID = 30182477;

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
  const parts = grouping.split(" - ");
  const vehicle = (parts[1] ?? parts[0] ?? "").trim();
  const driver = DRIVER_MAP[vehicle] ?? vehicle;
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
      driver: driverIdx >= 0 ? cellText(cells[driverIdx]) || driver : driver,
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
    throw new Error(`Wialon ${svc} failed with ${response.status}`);
  }
  const payload = (await response.json()) as { error?: number; reason?: string } | T;
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const errPayload = payload as { error?: number; reason?: string };
    if (typeof errPayload.error === "number" && errPayload.error !== 0) {
      throw new Error(
        `Wialon ${svc} error ${String(errPayload.error)}${errPayload.reason ? `: ${errPayload.reason}` : ""}`,
      );
    }
  }
  return payload as T;
}

export async function GET(request: Request) {
  try {
    const token = process.env.WIALON_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing WIALON_TOKEN environment variable." },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);
    const fromISO = searchParams.get("from");
    const toISO = searchParams.get("to");
    if (!fromISO || !toISO) {
      return NextResponse.json({ error: "Missing from/to query parameters." }, { status: 400 });
    }

    const from = Math.floor(new Date(fromISO).getTime() / 1000);
    const to = Math.floor(new Date(toISO).getTime() / 1000);

    const loginResponse = await fetch(
      `${API_URL}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`,
      { method: "POST", cache: "no-store" },
    );
    if (!loginResponse.ok) {
      throw new Error(`Wialon token/login failed with ${loginResponse.status}`);
    }
    const login = (await loginResponse.json()) as { eid?: string; error?: number; reason?: string };
    if (typeof login.error === "number") {
      throw new Error(`Wialon token/login error ${login.error}${login.reason ? `: ${login.reason}` : ""}`);
    }
    const sid = login.eid;
    if (!sid) {
      throw new Error("Wialon login failed.");
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

    const drivers: Driver[] = summaryRows.map((row, index) => {
      const cells = row.c ?? [];
      const grouping = cellText(cells[0]);
      const { driver, vehicle } = splitGrouping(grouping);
      return {
        id: `D${String(index + 1).padStart(3, "0")}`,
        name: driver,
        vehicle,
        distance: toNumber(cellText(cells[1])),
        avgSpeed: toNumber(cellText(cells[2])),
        maxSpeed: toNumber(cellText(cells[3])),
        engineRunningTime: cellText(cells[4]) || "N/A",
        idlingEngineTime: idlingByVehicle.get(vehicle) ?? "00:00:00",
        avgConsumption: toNumber(cellText(cells[5])),
        totalFillings: toNumber(cellText(cells[6])),
        totalDrains: toNumber(cellText(cells[7])),
        fuelFilled: toNumber(cellText(cells[8])),
        fuelDrained: toNumber(cellText(cells[9])),
        fuelConsumed: toNumber(cellText(cells[10])),
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
        const { driver, vehicle } = splitGrouping(grouping);
        const violation = cellText(cells[2]);
        if (!VIOLATION_TYPES.includes(violation as (typeof VIOLATION_TYPES)[number])) continue;
        violations.push({
          id: violations.length + 1,
          grouping,
          driver,
          vehicle,
          violation,
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

    const vehicleLocations = locationRows.map((row) => {
      const cells = row.c ?? [];
      const grouping = cellText(cells[0]);
      const { driver, vehicle } = splitGrouping(grouping);
      const lastMessageTime = shiftWialonDateTime(cellText(cells[1]), 3);
      const lastCoordinatesTime = shiftWialonDateTime(cellText(cells[2]), 3);
      const location = cellText(cells[3]);
      const locationCoords = cellCoords(cells[3]);
      const dfDriver = cellText(cells[4]) || driver;
      return {
        vehicle,
        driver: dfDriver,
        lastMessageTime,
        lastCoordinatesTime,
        location,
        locationCoords,
      };
    });

    const detail_ena_coach_fillings: FuelRecord[] = [];
    const detail_ena_coach_drains: FuelRecord[] = [];
    let fuelIdBase = 0;
    for (let tableIndex = 3; tableIndex < tables.length; tableIndex += 1) {
      const table = tables[tableIndex];
      const header = (table?.header ?? []).map((h) => String(h).toLowerCase()).join(" ");
      const rowsCount = table?.rows ?? 0;
      if (!rowsCount) continue;
      // Match notebook detailization flow: fetch per-parent-row subrows.
      let rows = await fetchTableSubrows(tableIndex, rowsCount, sid);
      if (!rows.length) {
        // Fallback for non-detailized tables.
        rows = await fetchTableRows(tableIndex, rowsCount, sid);
      }
      const mapped = rowsToFuelRecords(table?.header ?? [], rows, fuelIdBase);
      fuelIdBase += mapped.length;
      if (header.includes("drain")) {
        detail_ena_coach_drains.push(...mapped);
      } else if (header.includes("fill")) {
        detail_ena_coach_fillings.push(...mapped);
      }
    }

    const payload: WialonDataset = {
      drivers,
      violations,
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
    const message = error instanceof Error ? error.message : "Unknown Wialon error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

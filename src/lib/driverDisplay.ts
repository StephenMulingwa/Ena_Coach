import type { FuelRecord, ViolationRecord } from "./data";

function fuelRecordDriverRaw(r: FuelRecord) {
  const entries = Object.entries(r.columns ?? {});
  const found = entries.find(([k]) => k.toLowerCase() === "driver");
  return String(found?.[1] ?? r.driver ?? "").trim();
}

export function isMissingDriver(name: string) {
  const n = String(name ?? "").trim();
  if (!n) return true;
  const lower = n.toLowerCase();
  // Wialon tables often use placeholders for blank cells.
  if (n === "-----" || n === "—") return true;
  if (lower === "missing") return true;
  return false;
}

/** Vehicles that have at least one missing-driver row (violations + optional fuel + optional extras), sorted → Ena Driver1(M), 2(M), … */
export function buildVehicleMissingOrdinalMap(
  violations: ViolationRecord[],
  fuelFillings: FuelRecord[] = [],
  fuelDrains: FuelRecord[] = [],
  extraVehiclesWithMissing: string[] = [],
): Map<string, number> {
  const vehicles = new Set<string>();
  for (const v of violations) {
    const veh = String(v.vehicle ?? "").trim();
    if (veh && isMissingDriver(v.driver)) vehicles.add(veh);
  }
  for (const r of fuelFillings) {
    const veh = String(r.vehicle ?? "").trim();
    if (veh && isMissingDriver(fuelRecordDriverRaw(r))) vehicles.add(veh);
  }
  for (const r of fuelDrains) {
    const veh = String(r.vehicle ?? "").trim();
    if (veh && isMissingDriver(fuelRecordDriverRaw(r))) vehicles.add(veh);
  }
  for (const vehRaw of extraVehiclesWithMissing) {
    const veh = String(vehRaw ?? "").trim();
    if (veh) vehicles.add(veh);
  }
  const sorted = [...vehicles].sort((a, b) => a.localeCompare(b));
  const map = new Map<string, number>();
  sorted.forEach((veh, i) => map.set(veh, i + 1));
  return map;
}

export function missingDriverLabel(vehicle: string, ordinal: number) {
  void vehicle;
  return `Ena Driver${ordinal}(M)`;
}

export function knownDriverNamesOnVehicle(violations: ViolationRecord[], vehicle: string) {
  const veh = String(vehicle ?? "").trim();
  const s = new Set<string>();
  for (const v of violations) {
    if (String(v.vehicle ?? "").trim() !== veh) continue;
    if (!isMissingDriver(v.driver)) s.add(String(v.driver).trim());
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function vehicleHasMissingViolations(violations: ViolationRecord[], vehicle: string) {
  const veh = String(vehicle ?? "").trim();
  return violations.some(
    (v) => String(v.vehicle ?? "").trim() === veh && isMissingDriver(v.driver),
  );
}

/**
 * Dashboard / tables: show missing as "Ena Driver{N}(M)".
 * When the vehicle also has named drivers in the period, list them before the missing suffix.
 */
export function formatDriverDisplay(args: {
  vehicle: string;
  rawDriver: string;
  missingOrdinalByVehicle: Map<string, number>;
  violations: ViolationRecord[];
}): string {
  const vehicle = String(args.vehicle ?? "").trim() || "Unknown vehicle";
  const raw = String(args.rawDriver ?? "").trim();
  const ord = args.missingOrdinalByVehicle.get(vehicle) ?? 1;
  const missLabel = missingDriverLabel(vehicle, ord);
  const known = knownDriverNamesOnVehicle(args.violations, vehicle);
  const hasMissing = vehicleHasMissingViolations(args.violations, vehicle);

  if (isMissingDriver(raw)) {
    return missLabel;
  }
  // If a driver name is present, always show it exactly as-is (no merging/suffix),
  // even if the vehicle has missing-driver rows in the same period.
  void known;
  void hasMissing;
  return raw;
}

/** Synthetic filter value for "missing on this vehicle" in dropdowns */
export function missingDriverFilterValue(vehicle: string) {
  return `__MISSING__:${String(vehicle ?? "").trim()}`;
}

export function parseMissingDriverFilterValue(value: string): string | null {
  if (!value.startsWith("__MISSING__:")) return null;
  return value.slice("__MISSING__:".length).trim() || null;
}

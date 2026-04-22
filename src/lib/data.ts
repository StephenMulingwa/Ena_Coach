export interface Driver {
  id: string;
  name: string;
  vehicle: string;
  avgConsumption: number;
  distance: number;
  engineRunningTime: string;
  idlingEngineTime?: string;
  avgSpeed: number;
  maxSpeed: number;
  fuelConsumed: number;
  fuelDrained: number;
  fuelFilled: number;
  totalDrains: number;
  totalFillings: number;
  propulsion: string;
  transportWorkAvg: number;
}

export interface ViolationRecord {
  id: number;
  grouping: string;
  driver: string;
  vehicle: string;
  violation: string;
  beginning: string;
  initialLocation: string;
  initialLocationCoords: string;
  end: string;
  finalLocation: string;
  finalLocationCoords: string;
  avgSpeed: string;
  maxSpeed: string;
  duration: string;
  mileage: string;
  count: number;
}

export interface VehiclePerformance {
  vehicle: string;
  distanceKm: number;
  consumptionLitres: number;
  consumptionKmPerL: number;
  consumptionDrivingLitres: number;
  consumptionDrivingKmPerL: number;
  consumptionIdleLitres: number;
  consumptionIdleKmPerL: number;
  consumptionIdleLitres2: number;
  drivers: VehicleDriverEntry[];
}

export interface VehicleDriverEntry {
  driverId: string;
  driverName: string;
  distanceKm: number;
  consumptionLitres: number;
  consumptionKmPerL: number;
  consumptionDrivingLitres: number;
  consumptionDrivingKmPerL: number;
  consumptionIdleLitres: number;
  consumptionIdleKmPerL: number;
  consumptionIdleLitres2: number;
}

export interface FinalReportRow {
  driver: string;
  vehicle: string;
  avgFuelConsumption: number;
  distanceKm: number;
  engineRunningTime: string;
  idlingEngineTime: string;
  brakeAppsPer100: number;
  harshBrakePer100: number;
  harshAccelPer100: number | null;
  idlingPercent: number | null;
  engineOverspeedPercent: number | null;
  powertrainCoastingPercent: number | null;
  fuelConsumptionDiesel: number;
  fuelConsumptionIdlingDiesel: number | null;
  engineRunningTimeIdling: string | null;
  avgWeightTonnes: number | null;
  avgSpeedKmH: number;
  freewheelCoastingKm: number;
  brakeAppsQty: number;
  harshBrakeQty: number;
  overspeedingIncidents: number;
   totalFillings: number;
  fuelDrains: number;
  freewheeling: number;
}

export interface WialonDataset {
  drivers: Driver[];
  violations: ViolationRecord[];
  vehiclePerformance: VehiclePerformance[];
  finalReport: FinalReportRow[];
  vehicleLocations?: VehicleLocation[];
  fuelFillings?: FuelRecord[];
  fuelDrains?: FuelRecord[];
  fetchedAt: string;
}

export interface VehicleLocation {
  vehicle: string;
  driver: string;
  lastMessageTime: string;
  lastCoordinatesTime: string;
  location: string;
  locationCoords: string;
}

export interface FuelRecord {
  id: number;
  grouping: string;
  driver: string;
  vehicle: string;
  location: string;
  locationCoords: string;
  columns: Record<string, string>;
}

export interface SharedTabProps {
  data: WialonDataset | null;
  loading: boolean;
  error: string | null;
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onRun: () => void;
}

export const DRIVER_MAP: Record<string, string> = {
  "KDE 181Q": "Driver A",
  "KDE 182Q": "Driver B",
};

export const VIOLATION_TYPES = [
  "Harsh Cornering",
  "Over Speeding",
  "Harsh Braking",
  "Free Wheeling",
  "Over Revving",
] as const;

export type ViolationType = (typeof VIOLATION_TYPES)[number];

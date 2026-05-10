import * as XLSX from "xlsx";
import { VIOLATION_TYPES, type ViolationRecord } from "./data";
import { downloadPdfTable } from "./exportPdfTable";

export function makeTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

export function toDate(value: string) {
  const [datePart] = value.split(" ");
  const [dd, mm, yyyy] = datePart.split(".").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

export function exportMonitoringPdf(
  rows: ViolationRecord[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
) {
  downloadPdfTable({
    title: "Filtered violations",
    head: [[
      "Driver",
      "Vehicle",
      "Violation",
      "Beginning",
      "Initial location",
      "End",
      "Final location",
      "Value (RPM)",
      "Max. speed",
      "Duration",
      "Mileage",
    ]],
    body: rows.map((r) => [
      formatDriverCell(r.vehicle, r.driver),
      r.vehicle,
      r.violation,
      r.beginning,
      r.initialLocation,
      r.end,
      r.finalLocation,
      r.avgSpeed,
      r.maxSpeed,
      r.duration,
      r.mileage,
    ]),
    fileName: `violations_filtered_${makeTimestamp()}.pdf`,
    landscape: true,
  });
}

export function exportAllViolationsWorkbook(
  start: string,
  end: string,
  violations: ViolationRecord[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
) {
  const workbook = XLSX.utils.book_new();
  const s = new Date(start);
  const e = new Date(end);
  e.setHours(23, 59, 59, 999);

  for (const violationType of VIOLATION_TYPES) {
    const rows = violations.filter((r) => {
      const d = toDate(r.beginning);
      return d >= s && d <= e && r.violation === violationType;
    });
    const headers = [
      "Driver",
      "Vehicle",
      "Violation",
      "Beginning",
      "Initial location",
      "End",
      "Final location",
      "Value (RPM)",
      "Max. speed",
      "Duration",
      "Mileage",
    ];
    const aoa: XLSX.CellObject[][] = [];
    aoa.push(headers.map((h) => ({ t: "s", v: h })));
    for (const r of rows) {
      const initialLabel = String(r.initialLocation ?? "");
      const finalLabel = String(r.finalLocation ?? "");
      const initialQuery = String(r.initialLocationCoords || r.initialLocation || "");
      const finalQuery = String(r.finalLocationCoords || r.finalLocation || "");
      const initialUrl = initialQuery.trim()
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(initialQuery)}`
        : "";
      const finalUrl = finalQuery.trim()
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(finalQuery)}`
        : "";
      aoa.push([
        { t: "s", v: String(formatDriverCell(r.vehicle, r.driver) ?? "") },
        { t: "s", v: String(r.vehicle ?? "") },
        { t: "s", v: String(r.violation ?? "") },
        { t: "s", v: String(r.beginning ?? "") },
        initialUrl ? { t: "s", v: initialLabel, l: { Target: initialUrl } } : { t: "s", v: initialLabel },
        { t: "s", v: String(r.end ?? "") },
        finalUrl ? { t: "s", v: finalLabel, l: { Target: finalUrl } } : { t: "s", v: finalLabel },
        { t: "s", v: String(r.avgSpeed ?? "") },
        { t: "s", v: String(r.maxSpeed ?? "") },
        { t: "s", v: String(r.duration ?? "") },
        { t: "s", v: String(r.mileage ?? "") },
      ]);
    }
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(workbook, worksheet, violationType.slice(0, 31));
  }

  XLSX.writeFile(workbook, `violations_all_sheets_${makeTimestamp()}.xlsx`);
}

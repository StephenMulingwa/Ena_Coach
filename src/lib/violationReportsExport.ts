import * as XLSX from "xlsx";
import { type ViolationRecord } from "./data";
import { exportEnaReportPdf, formatDateRangeLabel } from "./exportEnaReportPdf";

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

/** A pre-grouped set of violation rows for a single violation type. Both the
 *  PDF and XLSX exports consume this shape so they always include every
 *  violation type (one section / one sheet per type), regardless of which type
 *  is currently selected on screen. */
export type ViolationTypeSection = {
  type: string;
  rows: ViolationRecord[];
};

export function exportMonitoringPdf(
  sections: ViolationTypeSection[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
  meta: {
    startDate: string;
    endDate: string;
    vehicleScope: string;
    driverScope: string;
  },
) {
  const head = [[
    "#",
    "Driver",
    "Vehicle",
    "Beginning",
    "Initial Location",
    "End",
    "Final Location",
    "Value (RPM)",
    "Max. Speed",
    "Duration",
    "Mileage",
  ]];

  const allRows = sections.flatMap((s) => s.rows);
  const totalRows = allRows.length;
  const distinctDrivers = new Set(
    allRows.map((r) => formatDriverCell(r.vehicle, r.driver)).filter(Boolean),
  ).size;
  const distinctVehicles = new Set(allRows.map((r) => r.vehicle).filter(Boolean)).size;

  // One summary card per violation type so the reader sees the breakdown at a
  // glance. Cards are red when there are events and green when clean.
  const summary = sections.map((s) => ({
    label: s.type,
    value: s.rows.length.toLocaleString(),
    accent: s.rows.length > 0 ? "#b91c1c" : "#15803d",
  }));

  const pdfSections = sections.map((s) => ({
    heading: `${s.type} — ${s.rows.length.toLocaleString()} event${s.rows.length === 1 ? "" : "s"}`,
    head,
    body:
      s.rows.length === 0
        ? [["—", `No "${s.type}" events recorded for ${meta.vehicleScope} · ${meta.driverScope}.`, "", "", "", "", "", "", "", "", ""]]
        : s.rows.map((r, idx) => [
            idx + 1,
            formatDriverCell(r.vehicle, r.driver),
            r.vehicle,
            r.beginning,
            r.initialLocation || "—",
            r.end,
            r.finalLocation || "—",
            r.avgSpeed,
            r.maxSpeed,
            r.duration,
            r.mileage,
          ]),
  }));

  void exportEnaReportPdf({
    title: "Ena Fleet Violation Monitoring Report",
    subtitle: formatDateRangeLabel(meta.startDate, meta.endDate),
    summary,
    narrative:
      totalRows === 0
        ? `No violation events found for ${meta.vehicleScope} · ${meta.driverScope}.`
        : `${totalRows.toLocaleString()} total event${totalRows === 1 ? "" : "s"} across ${distinctVehicles} vehicle${distinctVehicles === 1 ? "" : "s"} and ${distinctDrivers} driver${distinctDrivers === 1 ? "" : "s"} (${meta.vehicleScope} · ${meta.driverScope}).`,
    sections: pdfSections,
    fileName: `ena_fleet_violations_${makeTimestamp()}.pdf`,
    landscape: true,
  });
}

export function exportAllViolationsWorkbook(
  sections: ViolationTypeSection[],
  formatDriverCell: (vehicle: string, rawDriver: string) => string,
) {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

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

  for (const section of sections) {
    const aoa: XLSX.CellObject[][] = [];
    aoa.push(headers.map((h) => ({ t: "s", v: h })));

    if (section.rows.length === 0) {
      aoa.push([{ t: "s", v: `No "${section.type}" events recorded.` }]);
    } else {
      for (const r of section.rows) {
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
    }

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    // Excel sheet names: max 31 chars, no / \ ? * [ ].
    const baseName = section.type.replace(/[\\/?*[\]]/g, "-").slice(0, 31);
    let name = baseName;
    let suffix = 2;
    while (usedNames.has(name)) {
      const candidate = `${baseName.slice(0, 28)} (${suffix})`;
      name = candidate.slice(0, 31);
      suffix += 1;
    }
    usedNames.add(name);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }

  XLSX.writeFile(workbook, `ena_fleet_violations_${makeTimestamp()}.xlsx`);
}

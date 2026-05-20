import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import { ENA_LOGO_INTRINSIC, loadEnaLogoDataUrl } from "./loadEnaLogo";

export interface EnaSummarySegment {
  text: string;
  /** Optional hex color for this segment (e.g. "#15803d"). Falls back to the
   *  card's accent (or default dark text) when omitted. */
  color?: string;
}

export interface EnaSummaryItem {
  label: string;
  /** Plain value. Ignored when `segments` is provided. */
  value: string;
  /** Optional hex color for the value text when rendered as a single string. */
  accent?: string;
  /** Optional rich rendering: render multiple inline segments side-by-side,
   *  each with its own color. Use this when you want e.g. a green number
   *  next to a red number in the same card. */
  segments?: EnaSummarySegment[];
}

export interface EnaReportSection {
  /** Optional caption rendered above the table. */
  heading?: string;
  head: RowInput[];
  body: RowInput[];
  /** Optional column-level style hints (delegated to jspdf-autotable). */
  columnStyles?: Parameters<typeof autoTable>[1]["columnStyles"];
}

export interface ExportEnaReportPdfOpts {
  /** Big title rendered in the top brand band, e.g. "Ena Fleet Fuel Report". */
  title: string;
  /** Optional smaller label under the title, e.g. the date range. */
  subtitle?: string;
  /** Optional "key fact" cards rendered as a horizontal row under the header. */
  summary?: EnaSummaryItem[];
  /** Optional plain-text paragraph rendered between the summary cards and the first table. */
  narrative?: string;
  /** One or more tables. Each can carry its own caption via `heading`. */
  sections: EnaReportSection[];
  fileName: string;
  /** Defaults to landscape. */
  landscape?: boolean;
}

const BRAND_NAVY: [number, number, number] = [11, 47, 133];
const BRAND_BLUE: [number, number, number] = [47, 111, 237];
const BRAND_GOLD: [number, number, number] = [255, 212, 81];
const PAGE_MARGIN = 36;
const HEADER_HEIGHT = 78;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function getLastAutoTableY(doc: jsPDF): number | undefined {
  const ref = doc as unknown as { lastAutoTable?: { finalY?: number } };
  return ref.lastAutoTable?.finalY;
}

function drawHeader(doc: jsPDF, opts: ExportEnaReportPdfOpts, logoDataUrl: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND_NAVY);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, "F");

  let textX = PAGE_MARGIN;

  if (logoDataUrl) {
    const logoH = 44;
    const logoW = (ENA_LOGO_INTRINSIC.width / ENA_LOGO_INTRINSIC.height) * logoH;
    const logoY = (HEADER_HEIGHT - logoH) / 2;
    try {
      doc.addImage(logoDataUrl, "PNG", PAGE_MARGIN, logoY, logoW, logoH);
      textX = PAGE_MARGIN + logoW + 18;
    } catch {
      // ignore: render header without logo
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(opts.title, textX, 36);

  if (opts.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text(opts.subtitle, textX, 56);
  }

  // Right-aligned "Generated …" stamp on the brand band.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  const stamp = `Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} (EAT)`;
  doc.text(stamp, pageWidth - PAGE_MARGIN, 24, { align: "right" });
  doc.setTextColor(...BRAND_GOLD);
  doc.text("Ena Fleet Insights", pageWidth - PAGE_MARGIN, 42, { align: "right" });
}

function drawSummary(doc: jsPDF, summary: EnaSummaryItem[], startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const availW = pageWidth - PAGE_MARGIN * 2;
  const gap = 10;
  const boxH = 56;
  const count = summary.length;
  if (count === 0) return startY;
  const boxW = (availW - gap * (count - 1)) / count;
  const defaultText: [number, number, number] = [20, 30, 60];

  for (let i = 0; i < count; i += 1) {
    const item = summary[i];
    const x = PAGE_MARGIN + i * (boxW + gap);

    doc.setFillColor(245, 248, 255);
    doc.setDrawColor(219, 231, 255);
    doc.setLineWidth(0.7);
    doc.roundedRect(x, startY, boxW, boxH, 6, 6, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(70, 90, 130);
    doc.text(item.label.toUpperCase(), x + 12, startY + 18, { maxWidth: boxW - 24 });

    const accent = item.accent ? hexToRgb(item.accent) : null;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);

    if (item.segments && item.segments.length > 0) {
      // Render inline colored segments side-by-side. Each segment uses its own
      // color and we advance the cursor by the measured text width of the
      // previous segment so a card can show e.g. "796.00 L · 132.00 L" with
      // the second number in red.
      let cursorX = x + 12;
      const baselineY = startY + 42;
      for (const seg of item.segments) {
        const segColor = seg.color ? hexToRgb(seg.color) : accent;
        if (segColor) {
          doc.setTextColor(...segColor);
        } else {
          doc.setTextColor(...defaultText);
        }
        doc.text(seg.text, cursorX, baselineY);
        cursorX += doc.getTextWidth(seg.text);
      }
    } else {
      if (accent) {
        doc.setTextColor(...accent);
      } else {
        doc.setTextColor(...defaultText);
      }
      doc.text(item.value, x + 12, startY + 42, { maxWidth: boxW - 24 });
    }
  }

  return startY + boxH + 14;
}

function drawNarrative(doc: jsPDF, text: string, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const availW = pageWidth - PAGE_MARGIN * 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(50, 60, 90);
  const lines = doc.splitTextToSize(text, availW) as string[];
  doc.text(lines, PAGE_MARGIN, startY + 4);
  return startY + 4 + lines.length * 12 + 6;
}

function drawFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(220, 226, 240);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, pageHeight - 28, pageWidth - PAGE_MARGIN, pageHeight - 28);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 120, 140);
    doc.text("Powered by ControlTech · ena-fleet-insights", PAGE_MARGIN, pageHeight - 14);
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 14, { align: "right" });
  }
}

/**
 * Build a branded multi-section PDF report. Asynchronous because we lazily
 * fetch the Ena logo from /public on first use.
 */
export async function exportEnaReportPdf(opts: ExportEnaReportPdfOpts): Promise<void> {
  const doc = new jsPDF({
    orientation: opts.landscape !== false ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  const logoDataUrl = await loadEnaLogoDataUrl();

  drawHeader(doc, opts, logoDataUrl);

  let cursorY = HEADER_HEIGHT + 18;

  if (opts.summary && opts.summary.length > 0) {
    cursorY = drawSummary(doc, opts.summary, cursorY);
  }

  if (opts.narrative) {
    cursorY = drawNarrative(doc, opts.narrative, cursorY);
  }

  for (const section of opts.sections) {
    if (section.heading) {
      // Make sure the heading isn't orphaned near the bottom of the page.
      if (cursorY > pageHeight - 110) {
        doc.addPage();
        cursorY = PAGE_MARGIN;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20, 36, 80);
      doc.text(section.heading, PAGE_MARGIN, cursorY + 4);
      cursorY += 14;
    }

    autoTable(doc, {
      startY: cursorY,
      head: section.head,
      body: section.body,
      styles: { fontSize: 7.6, cellPadding: 3, overflow: "linebreak", valign: "middle" },
      headStyles: {
        fillColor: [BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2]],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 255] },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 40 },
      tableWidth: "auto",
      showHead: "everyPage",
      columnStyles: section.columnStyles,
    });

    cursorY = (getLastAutoTableY(doc) ?? cursorY) + 18;
  }

  drawFooter(doc);
  doc.save(opts.fileName);
}

/** Helper: format the active date range as "12 May 2026 06:20 → 12 May 2026 06:30". */
export function formatDateRangeLabel(start: string, end: string): string {
  const toLabel = (raw: string) => {
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString("en-GB", {
      timeZone: "Africa/Nairobi",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };
  const a = toLabel(start);
  const b = toLabel(end);
  if (!a && !b) return "";
  return `${a} → ${b} (EAT)`;
}

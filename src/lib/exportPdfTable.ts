import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export function downloadPdfTable(opts: {
  title: string;
  head: string[][];
  body: (string | number)[][];
  fileName: string;
  landscape?: boolean;
}) {
  const doc = new jsPDF({
    orientation: opts.landscape !== false ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text(opts.title, 40, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  autoTable(doc, {
    startY: 48,
    head: opts.head,
    body: opts.body,
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [47, 111, 237], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    margin: { left: 36, right: 36 },
    tableWidth: "auto",
    showHead: "everyPage",
  });
  doc.save(opts.fileName);
}

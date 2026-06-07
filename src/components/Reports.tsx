"use client";

import { useState, type CSSProperties } from "react";
import { ArrowLeft, ClipboardList, Droplets, FileBarChart2, Gauge, MapPin } from "lucide-react";
import { type SharedTabProps } from "../lib/data";
import Fuel from "./Fuel";
import SummaryReport from "./reports/SummaryReport";
import SpeedMonitoringReport from "./reports/SpeedMonitoringReport";
import MapReport from "./reports/MapReport";

type ReportId = "fuel" | "speed" | "summary" | "map";

interface ReportCardConfig {
  id: ReportId;
  title: string;
  description: string;
  Icon: typeof Droplets;
  iconColor: string;
  iconBackground: string;
  cardBackground: string;
  borderColor: string;
}

const REPORT_CARDS: ReportCardConfig[] = [
  {
    id: "fuel",
    title: "Fuel",
    description: "Fuel fillings and drains over a chosen period",
    Icon: Droplets,
    iconColor: "#2f6fed",
    iconBackground: "rgba(47,111,237,0.16)",
    cardBackground: "linear-gradient(135deg, #e8f0ff 0%, #f3f7ff 100%)",
    borderColor: "rgba(47,111,237,0.18)",
  },
  {
    id: "speed",
    title: "Speed Monitoring",
    description: "Speed bands and detailed trip records by vehicle",
    Icon: Gauge,
    iconColor: "#7c3aed",
    iconBackground: "rgba(124,58,237,0.16)",
    cardBackground: "linear-gradient(135deg, #f1ebff 0%, #f7f3ff 100%)",
    borderColor: "rgba(124,58,237,0.18)",
  },
  {
    id: "summary",
    title: "Summary",
    description: "Trip summary statistics aggregated per vehicle",
    Icon: ClipboardList,
    iconColor: "#e11d48",
    iconBackground: "rgba(225,29,72,0.16)",
    cardBackground: "linear-gradient(135deg, #ffe9ee 0%, #fff2f5 100%)",
    borderColor: "rgba(225,29,72,0.18)",
  },
  {
    id: "map",
    title: "Map",
    description: "Live positions of all fleet vehicles on an interactive map",
    Icon: MapPin,
    iconColor: "#0b2f85",
    iconBackground: "rgba(11,47,133,0.14)",
    cardBackground: "linear-gradient(135deg, #e8f0ff 0%, #eef5ff 100%)",
    borderColor: "rgba(11,47,133,0.2)",
  },
];

function ReportLandingCard({
  config,
  onOpen,
}: {
  config: ReportCardConfig;
  onOpen: () => void;
}) {
  const { Icon, iconColor, iconBackground, cardBackground, borderColor, title, description } = config;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 14,
        padding: "20px 22px",
        background: cardBackground,
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        textAlign: "left",
        cursor: "pointer",
        transition: "transform .18s ease, box-shadow .18s ease",
        minHeight: 168,
        width: "100%",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 12px 28px rgba(15, 40, 90, 0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "var(--shadow)";
      }}
    >
      <span
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: iconBackground,
          color: iconColor,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={22} strokeWidth={2.2} />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "var(--font-head)",
            fontSize: "1.05rem",
            fontWeight: 800,
            color: "var(--text)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: ".82rem", color: "var(--text2)", lineHeight: 1.4 }}>
          {description}
        </span>
      </div>
      <span
        style={{
          marginTop: "auto",
          fontFamily: "var(--font-head)",
          fontSize: ".82rem",
          fontWeight: 800,
          color: "#dc2626",
          letterSpacing: ".01em",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Open report
        <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>→</span>
      </span>
    </button>
  );
}

function ReportsLanding({
  onSelect,
}: {
  onSelect: (id: ReportId) => void;
}) {
  const titleStyle: CSSProperties = {
    fontFamily: "var(--font-head)",
    fontSize: "1.65rem",
    fontWeight: 700,
    letterSpacing: "-.01em",
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: 0,
  };

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={titleStyle}>
          <FileBarChart2 size={22} strokeWidth={2.4} color="#dc2626" aria-hidden />
          Reports
        </h2>
        <p
          style={{
            marginTop: 6,
            fontSize: ".88rem",
            color: "var(--text2)",
            fontWeight: 400,
            maxWidth: 720,
          }}
        >
          Pick a report below to open its dedicated builder. You can choose a time window, filter by vehicles, and download as Excel or PDF.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {REPORT_CARDS.map((card) => (
          <ReportLandingCard key={card.id} config={card} onOpen={() => onSelect(card.id)} />
        ))}
      </div>
    </div>
  );
}

function BackToReportsButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text)",
          fontSize: ".78rem",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={16} strokeWidth={2.2} />
        Back to reports
      </button>
    </div>
  );
}

export default function Reports(props: SharedTabProps) {
  const [activeReport, setActiveReport] = useState<ReportId | null>(null);

  if (activeReport === null) {
    return <ReportsLanding onSelect={setActiveReport} />;
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <BackToReportsButton onClick={() => setActiveReport(null)} />
      {activeReport === "fuel" && <Fuel {...props} />}
      {activeReport === "speed" && <SpeedMonitoringReport {...props} />}
      {activeReport === "summary" && <SummaryReport {...props} />}
      {activeReport === "map" && <MapReport {...props} />}
    </div>
  );
}

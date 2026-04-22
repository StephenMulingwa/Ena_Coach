"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Grid2x2,
  UserRoundSearch,
  BusFront,
  ShieldAlert,
  Droplets,
  FileBarChart2,
} from "lucide-react";
import Dashboard from "./Dashboard";
import DriverEvaluation from "./DriverEvaluation";
import VehiclePerformancePage from "./VehiclePerformance";
import Monitoring from "./Monitoring";
import Fuel from "./Fuel";
import Reports from "./Reports";
import { getDefaultOpsRange, type DateRange } from "../lib/dateRange";
import { useWialonData } from "../lib/useWialonData";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Grid2x2 },
  { id: "drivers", label: "Driver Evaluation", icon: UserRoundSearch },
  { id: "vehicles", label: "Vehicle Performance", icon: BusFront },
  { id: "monitoring", label: "Violations", icon: ShieldAlert },
  { id: "fuel", label: "Fuel", icon: Droplets },
  { id: "reports", label: "Reports", icon: FileBarChart2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface AppShellProps {
  onLogout: () => void;
  initialData?: import("../lib/data").WialonDataset | null;
}

export default function AppShell({ onLogout, initialData = null }: AppShellProps) {
  const defaultRange = getDefaultOpsRange();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [clock, setClock] = useState("");
  const [sidebarHover, setSidebarHover] = useState(false);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [appliedRange, setAppliedRange] = useState<DateRange>(defaultRange);
  const { data, loading, error } = useWialonData(appliedRange, { initialData, skipInitialFetch: true });

  const sharedProps = {
    data,
    loading,
    error,
    startDate,
    endDate,
    onStartChange: setStartDate,
    onEndChange: setEndDate,
    onRun: () => setAppliedRange({ start: startDate, end: endDate }),
  };

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const formatted = now.toLocaleString("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setClock(formatted);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "linear-gradient(90deg, #0b2f85 0%, #1b4fc2 48%, #2f6fed 100%)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.25)",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "64px",
          animation: "slideDown .4s ease",
          boxShadow: "0 10px 26px rgba(9, 40, 112, 0.34)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Image
            src="/enalogo.png"
            alt="Logo"
            width={36}
            height={36}
            loading="eager"
            priority
            style={{ borderRadius: "8px" }}
          />
          <span style={{ fontFamily: "var(--font-head)", fontSize: "1.02rem", fontWeight: 700, color: "#ffffff" }}>
            Ena <span style={{ color: "#ffd451" }}>Fleet Insights</span>
          </span>
          <div style={{ width: "1px", height: "28px", background: "rgba(255,255,255,0.35)" }} />
          <span style={{ fontSize: ".72rem", fontWeight: 500, color: "rgba(255,255,255,0.9)", letterSpacing: ".03em", textTransform: "uppercase" }}>
            Fleet Monitor · Kenya Operations
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: ".72rem", fontWeight: 600, color: "rgba(255,255,255,0.9)", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: "var(--radius-sm)", padding: "4px 10px" }}>
            EAT <span style={{ color: "#ffd451" }}>{clock}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "linear-gradient(90deg, rgba(8,140,95,0.95), rgba(14,164,111,0.95))",
              border: "1px solid rgba(255,255,255,0.45)",
              borderRadius: "20px",
              padding: "5px 12px",
              fontSize: ".76rem",
              color: "#ffffff",
              fontWeight: 800,
              letterSpacing: ".02em",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.15) inset, 0 4px 14px rgba(14,164,111,0.45)",
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#b6ffe4",
                animation: "pulse 1.6s ease infinite",
                boxShadow: "0 0 8px rgba(182,255,228,0.9)",
              }}
            />
            Live
          </div>

          <button
            onClick={onLogout}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: ".78rem",
              fontWeight: 600,
              color: "#ffffff",
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1 }}>
        <nav
          onMouseEnter={() => setSidebarHover(true)}
          onMouseLeave={() => setSidebarHover(false)}
          style={{
            width: sidebarHover ? "220px" : "76px",
            background: "linear-gradient(180deg, #1557d8 0%, #2f6fed 100%)",
            borderRight: "1px solid rgba(255,255,255,0.24)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "18px 0",
            gap: "6px",
            position: "sticky",
            top: "64px",
            height: "calc(100vh - 64px)",
            overflow: "hidden",
            transition: "width .28s cubic-bezier(.4,0,.2,1)",
            flexShrink: 0,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: "calc(100% - 16px)",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "11px 14px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  border: isActive ? "1px solid rgba(255,212,81,0.9)" : "1px solid transparent",
                  background: isActive ? "rgba(255,255,255,0.2)" : "transparent",
                  whiteSpace: "nowrap",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: "22px",
                    minWidth: "22px",
                    textAlign: "center",
                    color: isActive ? "#ffd451" : "rgba(255,255,255,0.95)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={18} />
                </span>
                <span style={{ fontSize: ".82rem", fontWeight: 700, color: isActive ? "#ffd451" : "rgba(255,255,255,0.95)", opacity: sidebarHover ? 1 : 0, transform: sidebarHover ? "none" : "translateX(-6px)", transition: "opacity .2s ease .08s, transform .2s ease .08s" }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
          <div
            style={{
              marginTop: "auto",
              width: "calc(100% - 16px)",
              borderTop: "1px solid rgba(255,255,255,0.26)",
              paddingTop: "12px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              overflow: "hidden",
            }}
          >
            <a
              href="https://www.controltech-ea.com/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: ".72rem",
                fontWeight: 700,
                color: "rgba(255,255,255,0.95)",
                whiteSpace: "nowrap",
                opacity: sidebarHover ? 1 : 0,
                width: sidebarHover ? "auto" : 0,
                transition: "opacity .2s ease",
                textDecoration: "none",
              }}
            >
              Powered by ControlTech
            </a>
            <Image
              src="/controltech_logo.png"
              alt="ControlTech"
              width={24}
              height={24}
              style={{
                width: sidebarHover ? "24px" : "18px",
                height: "auto",
                borderRadius: "4px",
                marginLeft: sidebarHover ? "auto" : "0",
              }}
            />
          </div>
        </nav>

        <main style={{ flex: 1, padding: "24px 28px", overflowX: "hidden", minWidth: 0, animation: "fadeUp .3s ease" }}>
          {activeTab === "dashboard" && <Dashboard {...sharedProps} />}
          {activeTab === "drivers" && <DriverEvaluation {...sharedProps} />}
          {activeTab === "vehicles" && <VehiclePerformancePage {...sharedProps} />}
          {activeTab === "monitoring" && <Monitoring {...sharedProps} />}
          {activeTab === "fuel" && <Fuel {...sharedProps} />}
          {activeTab === "reports" && <Reports {...sharedProps} />}
        </main>
      </div>
    </div>
  );
}


"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import Image from "next/image";
import {
  Grid2x2,
  UserRoundSearch,
  BusFront,
  ShieldAlert,
  FileBarChart2,
  Stethoscope,
  Menu,
  LogOut,
} from "lucide-react";
import Dashboard from "./Dashboard";
import DriverEvaluation from "./DriverEvaluation";
import VehiclePerformancePage from "./VehiclePerformance";
import Violations from "./Violations";
import Reports from "./Reports";
import Diagnostics from "./Diagnostics";
import { getDefaultOpsRange, type DateRange } from "../lib/dateRange";
import { useWialonData } from "../lib/useWialonData";
import { useMediaQuery } from "../lib/useMediaQuery";
import { LAYOUT_NARROW_QUERY } from "../lib/breakpoints";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Grid2x2 },
  { id: "drivers", label: "Driver Evaluation", icon: UserRoundSearch },
  { id: "vehicles", label: "Vehicle Performance", icon: BusFront },
  { id: "violations", label: "Violations", icon: ShieldAlert },
  { id: "diagnostics", label: "Diagnostics", icon: Stethoscope },
  { id: "reports", label: "Reports", icon: FileBarChart2 },
] as const;

const MOBILE_NAV_PRIMARY = TABS[0];
const MOBILE_NAV_SECONDARY = TABS.slice(1);

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [appliedRange, setAppliedRange] = useState<DateRange>(defaultRange);
  const [runNonce, setRunNonce] = useState(0);
  const { data, loading, error } = useWialonData(appliedRange, {
    initialData,
    skipInitialFetch: initialData != null,
    refreshNonce: runNonce,
  });

  const isMobileNav = useMediaQuery(LAYOUT_NARROW_QUERY);

  if (!isMobileNav && mobileNavOpen) {
    setMobileNavOpen(false);
  }

  const sharedProps = {
    data,
    loading,
    error,
    startDate,
    endDate,
    onStartChange: setStartDate,
    onEndChange: setEndDate,
    onRun: () => {
      setAppliedRange({ start: startDate, end: endDate });
      setRunNonce((n) => n + 1);
    },
    appliedDateRange: appliedRange,
  };

  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof document === "undefined") return;
    const setVar = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--app-shell-header-h", `${h}px`);
    };
    setVar();
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    window.addEventListener("resize", setVar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", setVar);
      document.documentElement.style.removeProperty("--app-shell-header-h");
    };
  }, []);

  useEffect(() => {
    if (!isMobileNav || !mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isMobileNav, mobileNavOpen]);

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

  const goTab = (id: TabId) => {
    setActiveTab(id);
    setMobileNavOpen(false);
  };

  const headerPadStyle: CSSProperties = isMobileNav
    ? {
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        paddingBottom: 10,
        paddingLeft: "max(10px, env(safe-area-inset-left, 0px))",
        paddingRight: "max(10px, env(safe-area-inset-right, 0px))",
      }
    : {
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: 0,
        paddingLeft: "max(24px, env(safe-area-inset-left, 0px))",
        paddingRight: "max(24px, env(safe-area-inset-right, 0px))",
      };

  const mainPadStyle: CSSProperties = isMobileNav
    ? {
        paddingTop: 14,
        paddingLeft: 12,
        paddingRight: 12,
        paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))",
      }
    : {
        paddingTop: 24,
        paddingLeft: 28,
        paddingRight: 28,
        paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
      };

  const tabButtonStyle = (isActive: boolean, fullLabel: boolean): CSSProperties => ({
    width: fullLabel ? "100%" : "calc(100% - 16px)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    border: isActive ? "1px solid rgba(255,212,81,0.9)" : "1px solid transparent",
    background: isActive ? "rgba(255,255,255,0.2)" : "transparent",
    whiteSpace: "nowrap",
    textAlign: "left",
    justifyContent: "flex-start",
  });

  const PrimaryNavIcon = MOBILE_NAV_PRIMARY.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header
        ref={headerRef}
        className="app-shell-header"
        style={{
          ...headerPadStyle,
          position: "sticky",
          top: 0,
          zIndex: 300,
          background: "linear-gradient(90deg, #0b2f85 0%, #1b4fc2 48%, #2f6fed 100%)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(255,255,255,0.25)",
          display: "flex",
          flexDirection: isMobileNav ? "column" : "row",
          alignItems: isMobileNav ? "stretch" : "center",
          justifyContent: "space-between",
          minHeight: isMobileNav ? undefined : "64px",
          gap: isMobileNav ? 6 : 8,
          animation: "slideDown .4s ease",
          boxShadow: "0 10px 26px rgba(9, 40, 112, 0.34)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: isMobileNav ? 8 : 12,
            minWidth: 0,
            ...(isMobileNav
              ? {}
              : {
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                }),
            width: isMobileNav ? "100%" : undefined,
            justifyContent: isMobileNav ? "flex-start" : undefined,
          }}
        >
          {isMobileNav && (
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Menu size={22} strokeWidth={2.2} />
            </button>
          )}
          <Image
            src="/enalogo.png"
            alt="Logo"
            width={isMobileNav ? 98 : 112}
            height={isMobileNav ? 40 : 46}
            loading="eager"
            priority
            style={{ flexShrink: 0, objectFit: "contain" }}
          />
          <span
            style={{
              fontFamily: "var(--font-head)",
              fontSize: isMobileNav ? ".95rem" : "1.02rem",
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.2,
              minWidth: 0,
            }}
          >
            Ena <span style={{ color: "#ffd451" }}>Fleet Insights</span>
          </span>
          {!isMobileNav && (
            <>
              <div style={{ width: "1px", height: "28px", background: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
              <span
                style={{
                  fontSize: ".72rem",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.9)",
                  letterSpacing: ".03em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                Fleet Monitor · Kenya Operations
              </span>
            </>
          )}
        </div>

        {isMobileNav && (
          <div
            style={{
              fontSize: ".62rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.88)",
              letterSpacing: ".04em",
              textTransform: "uppercase",
              lineHeight: 1.25,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Fleet Monitor · Kenya Operations
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: isMobileNav ? 6 : 12,
            flexShrink: 0,
            flexWrap: isMobileNav ? "nowrap" : "wrap",
            width: isMobileNav ? "100%" : undefined,
            justifyContent: isMobileNav ? "flex-start" : undefined,
            overflowX: isMobileNav ? "auto" : undefined,
            WebkitOverflowScrolling: isMobileNav ? "touch" : undefined,
            paddingBottom: isMobileNav ? 0 : undefined,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: isMobileNav ? ".6rem" : ".72rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: "var(--radius-sm)",
              padding: isMobileNav ? "5px 8px" : "4px 10px",
              lineHeight: 1.25,
              whiteSpace: isMobileNav ? "nowrap" : undefined,
              flexShrink: 0,
            }}
          >
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
              padding: isMobileNav ? "4px 10px" : "5px 12px",
              fontSize: isMobileNav ? ".7rem" : ".76rem",
              color: "#ffffff",
              fontWeight: 800,
              letterSpacing: ".02em",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.15) inset, 0 4px 14px rgba(14,164,111,0.45)",
              flexShrink: 0,
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
            type="button"
            onClick={onLogout}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: ".78rem",
              fontWeight: 600,
              color: "#ffffff",
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "var(--radius-sm)",
              padding: isMobileNav ? "6px 10px" : "6px 14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              marginLeft: isMobileNav ? "auto" : undefined,
            }}
          >
            {isMobileNav ? (
              <>
                <LogOut size={16} />
                <span style={{ fontSize: ".68rem", whiteSpace: "nowrap" }}>Sign Out</span>
              </>
            ) : (
              "Sign Out"
            )}
          </button>
        </div>
      </header>

      {isMobileNav && mobileNavOpen && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: "var(--app-shell-header-h, 64px)",
            bottom: 0,
            zIndex: 260,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              border: "none",
              padding: 0,
              margin: 0,
              background: "rgba(15, 40, 90, 0.45)",
              cursor: "pointer",
            }}
          />
          <nav
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "min(300px, 88vw)",
              minHeight: 0,
              background: "linear-gradient(180deg, #0f3a9e 0%, #1557d8 40%, #2f6fed 100%)",
              borderRight: "1px solid rgba(255,255,255,0.22)",
              boxShadow: "12px 0 40px rgba(9, 40, 112, 0.35)",
              display: "flex",
              flexDirection: "column",
              padding: "12px 10px 18px",
              animation: "fadeUp .22s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
              <button
                key={MOBILE_NAV_PRIMARY.id}
                type="button"
                onClick={() => goTab(MOBILE_NAV_PRIMARY.id)}
                style={tabButtonStyle(activeTab === MOBILE_NAV_PRIMARY.id, true)}
              >
                <span
                  style={{
                    width: 22,
                    minWidth: 22,
                    textAlign: "center",
                    color: activeTab === MOBILE_NAV_PRIMARY.id ? "#ffd451" : "rgba(255,255,255,0.95)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PrimaryNavIcon size={18} />
                </span>
                <span
                  style={{
                    fontSize: ".84rem",
                    fontWeight: 700,
                    color: activeTab === MOBILE_NAV_PRIMARY.id ? "#ffd451" : "rgba(255,255,255,0.95)",
                  }}
                >
                  {MOBILE_NAV_PRIMARY.label}
                </span>
              </button>
            </div>
            <div
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minHeight: 0,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                paddingTop: 2,
                WebkitOverflowScrolling: "touch",
              }}
            >
              {MOBILE_NAV_SECONDARY.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => goTab(tab.id)}
                    style={tabButtonStyle(isActive, true)}
                  >
                    <span
                      style={{
                        width: 22,
                        minWidth: 22,
                        textAlign: "center",
                        color: isActive ? "#ffd451" : "rgba(255,255,255,0.95)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={18} />
                    </span>
                    <span
                      style={{
                        fontSize: ".84rem",
                        fontWeight: 700,
                        color: isActive ? "#ffd451" : "rgba(255,255,255,0.95)",
                      }}
                    >
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              style={{
                marginTop: "auto",
                paddingTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.22)",
                display: "flex",
                alignItems: "center",
                gap: 10,
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
                  textDecoration: "none",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                Powered by ControlTech
              </a>
              <Image src="/controltech_logo.png" alt="ControlTech" width={26} height={26} style={{ borderRadius: 4 }} />
            </div>
          </nav>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1 }}>
        <nav
          aria-hidden={isMobileNav}
          onMouseEnter={() => !isMobileNav && setSidebarHover(true)}
          onMouseLeave={() => !isMobileNav && setSidebarHover(false)}
          style={{
            display: isMobileNav ? "none" : "flex",
            width: sidebarHover ? "220px" : "76px",
            background: "linear-gradient(180deg, #1557d8 0%, #2f6fed 100%)",
            borderRight: "1px solid rgba(255,255,255,0.24)",
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
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={tabButtonStyle(isActive, false)}
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
                <span
                  style={{
                    fontSize: ".82rem",
                    fontWeight: 700,
                    color: isActive ? "#ffd451" : "rgba(255,255,255,0.95)",
                    opacity: sidebarHover ? 1 : 0,
                    transform: sidebarHover ? "none" : "translateX(-6px)",
                    transition: "opacity .2s ease .08s, transform .2s ease .08s",
                  }}
                >
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

        <main
          style={{
            flex: 1,
            ...mainPadStyle,
            overflowX: "auto",
            minWidth: 0,
            animation: "fadeUp .3s ease",
          }}
        >
          {activeTab === "dashboard" && <Dashboard {...sharedProps} />}
          {activeTab === "drivers" && <DriverEvaluation {...sharedProps} />}
          {activeTab === "vehicles" && <VehiclePerformancePage {...sharedProps} />}
          {activeTab === "violations" && <Violations {...sharedProps} />}
          {activeTab === "reports" && <Reports {...sharedProps} />}
          {activeTab === "diagnostics" && <Diagnostics {...sharedProps} />}
        </main>
      </div>
    </div>
  );
}

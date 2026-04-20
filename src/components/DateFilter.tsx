"use client";

interface DateFilterProps {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onRun?: () => void;
  runLabel?: string;
  running?: boolean;
}

export default function DateFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
  runLabel = "Run",
  running = false,
}: DateFilterProps) {
  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text)",
    fontSize: ".78rem",
    fontFamily: "var(--font-mono)",
    outline: "none",
    transition: "var(--transition)",
    colorScheme: "light",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
      <span style={{ fontSize: ".72rem", color: "var(--text)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
        From
      </span>
      <input
        type="datetime-local"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        style={inputStyle}
      />
      <span style={{ fontSize: ".72rem", color: "var(--text)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
        To
      </span>
      <input
        type="datetime-local"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        style={inputStyle}
      />

      {onRun && (
        <button
          onClick={onRun}
          disabled={running}
          style={{
            padding: "8px 16px",
            background: "linear-gradient(90deg, rgba(245,179,0,0.95), rgba(255,212,81,0.95))",
            border: "1px solid rgba(245,179,0,0.5)",
            borderRadius: "var(--radius-sm)",
            color: "#4a3200",
            fontWeight: 800,
            fontFamily: "var(--font-head)",
            fontSize: ".78rem",
            cursor: running ? "wait" : "pointer",
            letterSpacing: ".02em",
            boxShadow: "0 6px 16px rgba(245,179,0,0.22)",
            opacity: running ? 0.7 : 1,
          }}
        >
          {running ? "Running..." : runLabel}
        </button>
      )}
    </div>
  );
}


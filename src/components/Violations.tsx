"use client";

import PageHeader from "./PageHeader";
import DateFilter from "./DateFilter";
import ViolationMonitoringPanel from "./ViolationMonitoringPanel";
import type { SharedTabProps } from "../lib/data";

export default function Violations({
  data,
  loading,
  error,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onRun,
}: SharedTabProps) {
  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "auto", overflowY: "visible" }}>
      <PageHeader
        title="Fleet"
        titleAccent="Violations"
        right={
          <DateFilter
            startDate={startDate}
            endDate={endDate}
            onStartChange={onStartChange}
            onEndChange={onEndChange}
            onRun={onRun}
            running={loading}
          />
        }
      />
      {error && <p style={{ color: "var(--red)", marginBottom: 12, fontSize: ".82rem" }}>{error}</p>}
      <ViolationMonitoringPanel data={data} startDate={startDate} endDate={endDate} />
    </div>
  );
}

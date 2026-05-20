"use client";

import { useState } from "react";
import Login from "../components/Login";
import AppShell from "../components/AppShell";
import { getDefaultOpsRange } from "../lib/dateRange";
import type { WialonDataset } from "../lib/data";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initialData, setInitialData] = useState<WialonDataset | null>(null);

  if (!isLoggedIn) {
    return (
      <Login
        onLogin={async () => {
          try {
            const range = getDefaultOpsRange();
            const query = new URLSearchParams({ from: range.start, to: range.end });
            const res = await fetch(`/api/wialon/report?${query.toString()}`, { cache: "no-store" });
            if (!res.ok) {
              let details = "";
              try {
                const errPayload = (await res.json()) as { error?: string };
                details = errPayload?.error ? `: ${errPayload.error}` : "";
              } catch {
                details = "";
              }
              throw new Error(`Track3 Database request failed (${res.status})${details}`);
            }
            const payload = (await res.json()) as WialonDataset;
            setInitialData(payload);
            setIsLoggedIn(true);
          } catch (err) {
            const baseMessage =
              err instanceof Error && err.message
                ? err.message
                : "Failed to load report data from Track3 Database.";
            throw new Error(baseMessage);
          }
        }}
      />
    );
  }

  return <AppShell initialData={initialData} onLogout={() => setIsLoggedIn(false)} />;
}

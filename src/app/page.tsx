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
          const range = getDefaultOpsRange();
          const query = new URLSearchParams({ from: range.start, to: range.end });
          const res = await fetch(`/api/wialon/report?${query.toString()}`, { cache: "no-store" });
          if (!res.ok) {
            throw new Error(`Wialon request failed (${res.status})`);
          }
          const payload = (await res.json()) as WialonDataset;
          setInitialData(payload);
          setIsLoggedIn(true);
        }}
      />
    );
  }

  return <AppShell initialData={initialData} onLogout={() => setIsLoggedIn(false)} />;
}

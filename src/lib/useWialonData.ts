"use client";

import { useEffect, useRef, useState } from "react";
import type { WialonDataset } from "./data";
import type { DateRange } from "./dateRange";

export function useWialonData(
  range: DateRange,
  options?: {
    initialData?: WialonDataset | null;
    skipInitialFetch?: boolean;
    /** Increment when the user clicks Run so we refetch even if the date range strings are unchanged. */
    refreshNonce?: number;
  },
) {
  const [data, setData] = useState<WialonDataset | null>(options?.initialData ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function fetchData() {
      if (firstRun.current) {
        firstRun.current = false;
        if (options?.skipInitialFetch && options?.initialData) {
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          from: range.start,
          to: range.end,
        });
        const response = await fetch(`/api/wialon/report?${query.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          let details = "";
          try {
            const errorPayload = (await response.json()) as { error?: string };
            details = errorPayload?.error ? `: ${errorPayload.error}` : "";
          } catch {
            details = "";
          }
          throw new Error(`Wialon request failed (${response.status})${details}`);
        }
        const payload = (await response.json()) as WialonDataset;
        if (alive) {
          setData(payload);
        }
      } catch (err) {
        if (!alive || controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Failed to fetch Wialon data.";
        setError(message);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [range.start, range.end, options?.skipInitialFetch, options?.initialData, options?.refreshNonce]);

  return { data, loading, error };
}

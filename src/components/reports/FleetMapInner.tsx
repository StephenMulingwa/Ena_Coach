"use client";

import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type FleetMapUnit = {
  id: string;
  vehicle: string;
  driver: string;
  location: string;
  lastSeen: string;
  lat: number;
  lon: number;
};

type FleetMapInnerProps = {
  units: FleetMapUnit[];
  loading?: boolean;
  onRefresh?: () => void;
};

const DEFAULT_CENTER: [number, number] = [-1.286389, 36.817223];

function FitBounds({ units }: { units: { lat: number; lon: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (!units.length) return;
    const bounds = L.latLngBounds(units.map((u) => [u.lat, u.lon] as [number, number]));
    map.fitBounds(bounds.pad(0.18));
  }, [map, units]);
  return null;
}

export default function FleetMapInner({ units, loading = false, onRefresh }: FleetMapInnerProps) {
  const center = useMemo(() => {
    if (!units.length) return DEFAULT_CENTER;
    const lat = units.reduce((sum, u) => sum + u.lat, 0) / units.length;
    const lon = units.reduce((sum, u) => sum + u.lon, 0) / units.length;
    return [lat, lon] as [number, number];
  }, [units]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <p style={{ margin: 0, fontSize: ".86rem", color: "var(--text2)", fontWeight: 500, maxWidth: 520 }}>
          Live positions for all tracked vehicles. Tap a marker for vehicle, driver, and last update. Pan and zoom
          as needed.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-head)",
              fontSize: ".72rem",
              fontWeight: 700,
              color: "var(--text)",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "5px 12px",
            }}
          >
            {units.length} vehicle{units.length === 1 ? "" : "s"} on map
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              style={{
                fontFamily: "var(--font-head)",
                fontSize: ".78rem",
                fontWeight: 700,
                color: "#14110c",
                background: "linear-gradient(90deg, rgba(245,179,0,1) 0%, rgba(255,212,81,0.95) 100%)",
                border: "1px solid rgba(245,179,0,0.45)",
                borderRadius: "var(--radius-sm)",
                padding: "7px 14px",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Refreshing…" : "Refresh positions"}
            </button>
          )}
        </div>
      </div>

      {!units.length && (
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(245,179,0,0.12)",
            border: "1px solid rgba(245,179,0,0.35)",
            color: "var(--text)",
            fontSize: ".82rem",
            fontWeight: 600,
          }}
        >
          No vehicles with valid GPS coordinates for this data load. Tap Run to refresh, or check that units are
          reporting location to the fleet system.
        </p>
      )}

      <div
        style={{
          overflow: "hidden",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          background: "var(--surface)",
        }}
      >
        <MapContainer
          center={center}
          zoom={units.length ? 8 : 6}
          style={{ height: "min(62vh, 620px)", minHeight: 420, width: "100%", zIndex: 0 }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds units={units} />
          {units.map((unit) => (
            <CircleMarker
              key={unit.id}
              center={[unit.lat, unit.lon]}
              radius={10}
              pathOptions={{
                color: "#0b2f85",
                weight: 2,
                fillColor: "#f5b300",
                fillOpacity: 0.92,
              }}
            >
              <Popup>
                <div style={{ fontFamily: "Arial, sans-serif", fontSize: 13, lineHeight: 1.45, color: "#11284d" }}>
                  <strong style={{ color: "#0b2f85" }}>{unit.vehicle}</strong>
                  <br />
                  <span>{unit.driver}</span>
                  <br />
                  <span style={{ color: "#4d6488" }}>{unit.location || "Unknown location"}</span>
                  <br />
                  <span style={{ fontSize: 12, color: "#4d6488" }}>Last update: {unit.lastSeen}</span>
                  <br />
                  <a
                    href={`https://www.google.com/maps?q=${encodeURIComponent(`${unit.lat},${unit.lon}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2f6fed", fontWeight: 700 }}
                  >
                    Open in Google Maps
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

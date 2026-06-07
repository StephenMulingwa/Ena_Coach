/** Parse Wialon-style "lat,lon" coordinates (y,x from cellCoords). */
export function parseLocationCoords(raw: string): { lat: number; lon: number } | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  const match = value.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return { lat, lon };
}

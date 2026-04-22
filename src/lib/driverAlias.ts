function indexToLetters(index: number) {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const rem = (current - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

export function buildDriverAliasMap(names: string[]) {
  const uniqueNames = [...new Set(
    names
      .map((name) => String(name ?? "").trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));

  const aliasMap = new Map<string, string>();
  uniqueNames.forEach((name, idx) => {
    aliasMap.set(name, `Driver ${indexToLetters(idx)}`);
  });
  return aliasMap;
}

export function aliasDriverName(name: string, aliasMap: Map<string, string>) {
  const normalized = String(name ?? "").trim();
  if (!normalized) return "—";
  // Preserve explicit, client-facing aliases (e.g. "Driver A") without re-aliasing.
  if (/^Driver\s+[A-Z]$/.test(normalized)) return normalized;
  return aliasMap.get(normalized) ?? "Driver";
}

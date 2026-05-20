import "server-only";

/** Default portal accounts (normalized keys). Override or extend via `ENA_APP_USERS_JSON`. */
const BUILTIN_APP_USERS: Record<string, string> = {
  "ena-coach": "Ena-Coach@2008",
  "sales@controltech-ea.com": "Sales@2020",
  "raihaan@controltech-ea.com": "Raihaan@2020",
  "datacenter@enacoach.co.ke": "Datacenter@2020",
};

function normalizeAppUsername(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeUserPasswordMap(source: Record<string, unknown>, label: string): Record<string, string> {
  return Object.entries(source).reduce<Record<string, string>>((acc, [username, password]) => {
    if (typeof password !== "string") {
      throw new Error(`${label} entry for "${username}" must have a string password.`);
    }

    const normalizedUsername = normalizeAppUsername(username);
    const trimmedPassword = password.trim();
    if (normalizedUsername && trimmedPassword) {
      acc[normalizedUsername] = trimmedPassword;
    }
    return acc;
  }, {});
}

function getAppUsersFromEnv(): Record<string, string> | null {
  const raw = process.env.ENA_APP_USERS_JSON?.trim();
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ENA_APP_USERS_JSON must be a valid JSON object of username/password pairs.");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("ENA_APP_USERS_JSON must be a JSON object of username/password pairs.");
  }

  const normalizedEntries = normalizeUserPasswordMap(parsed as Record<string, unknown>, "ENA_APP_USERS_JSON");

  if (!Object.keys(normalizedEntries).length) {
    throw new Error("ENA_APP_USERS_JSON does not contain any valid login entries.");
  }

  return normalizedEntries;
}

/** Merged map: built-in users, then env entries (env wins on key clash). */
export function getAppUsers(): Record<string, string> {
  const fromEnv = getAppUsersFromEnv();
  if (!fromEnv) {
    return { ...BUILTIN_APP_USERS };
  }
  return { ...BUILTIN_APP_USERS, ...fromEnv };
}

export function verifyAppCredentials(username: string, password: string) {
  const users = getAppUsers();
  const expectedPassword = users[normalizeAppUsername(username)];
  const given = String(password ?? "").trim();
  return typeof expectedPassword === "string" && given === expectedPassword;
}

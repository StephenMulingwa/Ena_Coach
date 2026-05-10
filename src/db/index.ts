import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.EnaDB?.trim();
  if (!url) {
    throw new Error("EnaDB connection string is not set");
  }
  return url;
}

let _db: NeonHttpDatabase<typeof schema> | null = null;

/** Lazy so `next build` does not require EnaDB unless API routes are exercised. */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(neon(connectionString()), { schema });
  }
  return _db;
}

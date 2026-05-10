import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const fleetAiSession = pgTable("fleet_ai_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fleetAiMessage = pgTable(
  "fleet_ai_message",
  {
    id: serial("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => fleetAiSession.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
  },
  (t) => ({
    roleCheck: check("fleet_ai_message_role_check", sql`${t.role} IN ('user', 'assistant')`),
  }),
);

/** Singleton row (id = 1): last selected session for this deployment. */
export const fleetAiMeta = pgTable("fleet_ai_meta", {
  id: integer("id").primaryKey(),
  activeSessionId: uuid("active_session_id").references(() => fleetAiSession.id, {
    onDelete: "set null",
  }),
});

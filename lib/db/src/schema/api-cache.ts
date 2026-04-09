import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { tournamentsTable } from "./tournaments";

export const apiCacheTable = pgTable("api_cache", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  refreshIntervalMinutes: integer("refresh_interval_minutes").notNull().default(5),
}, (t) => [
  unique().on(t.tournamentId),
]);

export type ApiCache = typeof apiCacheTable.$inferSelect;

import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { tournamentsTable } from "./tournaments";
import { poolMembersTable } from "./pool-members";

export const manualScoresTable = pgTable("manual_scores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  poolMemberId: text("pool_member_id").notNull().references(() => poolMembersTable.id, { onDelete: "cascade" }),
  r1: integer("round_1"),
  r2: integer("round_2"),
  r3: integer("round_3"),
  r4: integer("round_4"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique().on(t.tournamentId, t.poolMemberId),
]);

export type ManualScore = typeof manualScoresTable.$inferSelect;

import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tournamentsTable } from "./tournaments";
import { poolMembersTable } from "./pool-members";

// Marks that a member has *submitted* (not just drafted) their picks for a
// tournament. Absence of a row = not yet submitted. One row per member/event.
export const pickSubmissionsTable = pgTable("pick_submissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  poolMemberId: text("pool_member_id").notNull().references(() => poolMembersTable.id, { onDelete: "cascade" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.tournamentId, t.poolMemberId),
]);

export type PickSubmission = typeof pickSubmissionsTable.$inferSelect;

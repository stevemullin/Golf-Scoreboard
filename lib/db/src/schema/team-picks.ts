import { pgTable, text, unique } from "drizzle-orm/pg-core";
import { tournamentsTable } from "./tournaments";
import { poolMembersTable } from "./pool-members";
import { golfersTable } from "./golfers";

export const teamPicksTable = pgTable("team_picks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tournamentId: text("tournament_id").notNull().references(() => tournamentsTable.id, { onDelete: "cascade" }),
  poolMemberId: text("pool_member_id").notNull().references(() => poolMembersTable.id, { onDelete: "cascade" }),
  golferId: text("golfer_id").notNull().references(() => golfersTable.id, { onDelete: "cascade" }),
}, (t) => [
  unique().on(t.tournamentId, t.poolMemberId, t.golferId),
]);

export type TeamPick = typeof teamPicksTable.$inferSelect;

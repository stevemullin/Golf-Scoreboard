import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const golfersTable = pgTable("golfers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  espnId: text("espn_id").unique(),
  name: text("name").notNull(),
  flag: text("flag"), // country flag image URL (from ESPN)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGolferSchema = createInsertSchema(golfersTable).omit({ id: true, createdAt: true });
export type InsertGolfer = z.infer<typeof insertGolferSchema>;
export type Golfer = typeof golfersTable.$inferSelect;

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const poolMembersTable = pgTable("pool_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPoolMemberSchema = createInsertSchema(poolMembersTable).omit({ id: true, createdAt: true });
export type InsertPoolMember = z.infer<typeof insertPoolMemberSchema>;
export type PoolMember = typeof poolMembersTable.$inferSelect;

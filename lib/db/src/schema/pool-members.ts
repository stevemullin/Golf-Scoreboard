import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const poolMembersTable = pgTable("pool_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email"),
  // Unguessable per-member token; the participant's private pick link is /me/<token>.
  accessToken: text("access_token").notNull().$defaultFn(() => crypto.randomUUID()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("pool_members_access_token_key").on(t.accessToken),
]);

export const insertPoolMemberSchema = createInsertSchema(poolMembersTable).omit({ id: true, createdAt: true, accessToken: true });
export type InsertPoolMember = z.infer<typeof insertPoolMemberSchema>;
export type PoolMember = typeof poolMembersTable.$inferSelect;

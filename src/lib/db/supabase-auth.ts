import { boolean, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The parts of Supabase's `auth` schema the app reads. Supabase owns these
 * tables, so they are not exported from ./schema and drizzle-kit never
 * migrates them; app tables only reference `users.id`.
 */
const auth = pgSchema("auth");

export const authUsers = auth.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  isAnonymous: boolean("is_anonymous"),
  rawUserMetaData: jsonb("raw_user_meta_data"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
});

export const authIdentities = auth.table("identities", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  provider: text("provider").notNull(),
});

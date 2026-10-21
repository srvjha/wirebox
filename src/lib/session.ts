import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string; name: string };

/** Display name from the user's metadata, falling back to the email's local part. */
export function nameOf(email: string | undefined, meta: Record<string, unknown> | undefined) {
  const name = meta?.name ?? meta?.full_name;
  return typeof name === "string" && name.trim() ? name.trim() : (email ?? "").split("@")[0];
}

/** Session for Route Handlers and dynamic server code. */
export async function getServerSession(): Promise<{ user: SessionUser } | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  return { user: { id: u.id, email: u.email ?? "", name: nameOf(u.email, u.user_metadata) } };
}

export function isAdmin(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

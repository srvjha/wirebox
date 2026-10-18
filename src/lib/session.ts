import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Session for Route Handlers and dynamic server code. */
export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}

export function isAdmin(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

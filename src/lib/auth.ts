import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { db } from "@/lib/db";
import { GUEST_EMAIL_DOMAIN, isGuestEmail } from "@/lib/guest";
import * as schema from "@/lib/db/schema";
import { captureServer } from "@/lib/posthog-server";

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

/**
 * One-click guest accounts for trying the app without signing up. On by
 * default in development; in production set GUEST_LOGIN=true to allow it.
 */
export const guestLoginEnabled =
  process.env.GUEST_LOGIN === "true" || (process.env.NODE_ENV !== "production" && process.env.GUEST_LOGIN !== "false");

export const auth = betterAuth({
  appName: "Wirebox",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await captureServer(user.id, "user_signed_up", {
            email: user.email,
            guest: isGuestEmail(user.email),
            $set: { email: user.email, name: user.name },
          });
        },
      },
    },
  },
  plugins: [
    ...(guestLoginEnabled
      ? [anonymous({ emailDomainName: GUEST_EMAIL_DOMAIN, generateName: () => "Guest learner" })]
      : []),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

/**
 * Accounts are switched off for now: no sign-in entry points, no AI mentor (it needs an account).
 * Set NEXT_PUBLIC_AUTH_ENABLED=true and redeploy to bring them back.
 */
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

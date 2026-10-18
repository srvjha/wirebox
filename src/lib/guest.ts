/** Email domain Better Auth uses for one-click guest accounts. */
export const GUEST_EMAIL_DOMAIN = "guest.wirebox.local";

export function isGuestEmail(email: string | null | undefined) {
  return !!email?.endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}

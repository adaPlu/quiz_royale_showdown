export const GUEST_EMAIL_DOMAIN = "guest.quizroyale.invalid";
export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function buildGuestEmail(userId: string): string {
  return `guest-${userId.toLowerCase()}@${GUEST_EMAIL_DOMAIN}`;
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`) ?? false;
}

export function isGuestSessionExpired(
  createdAt: Date,
  nowMs: number = Date.now(),
): boolean {
  return createdAt.getTime() + GUEST_SESSION_TTL_MS <= nowMs;
}

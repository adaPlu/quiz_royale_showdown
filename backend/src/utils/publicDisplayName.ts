const AUTO_DISPLAY_NAME_PREFIX = "userID";
const AUTO_DISPLAY_NAME_RANGE = 1000;

/**
 * Build a stable, player-safe fallback name without exposing the database ID.
 * The public format is userID001 through userID999.
 */
export function buildAutoDisplayName(userId: string): string {
  let hash = 0;

  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) % AUTO_DISPLAY_NAME_RANGE;
  }

  const numericSuffix = hash === 0 ? 1 : hash;
  return `${AUTO_DISPLAY_NAME_PREFIX}${String(numericSuffix).padStart(3, "0")}`;
}

export function resolvePublicDisplayName(
  displayName: string | null | undefined,
  userId: string
): string {
  const normalizedName = displayName?.trim();
  return normalizedName || buildAutoDisplayName(userId);
}

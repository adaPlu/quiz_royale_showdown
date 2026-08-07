const AUTO_DISPLAY_NAME_PREFIX = "userID";
const AUTO_DISPLAY_NAME_RANGE = 1_000_000;
const AUTO_DISPLAY_NAME_DIGITS = 6;

const INTERNAL_IDENTIFIER_PATTERNS = [
  /^[0-9A-Z]{26}$/i,
  /^[0-9a-f]{32,64}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
];

/**
 * Build a stable, player-safe fallback name without exposing the database ID.
 * The enlarged numeric space makes collisions inside a room extremely unlikely.
 */
export function buildAutoDisplayName(userId: string): string {
  let hash = 0;

  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) % AUTO_DISPLAY_NAME_RANGE;
  }

  const numericSuffix = hash === 0 ? 1 : hash;
  return `${AUTO_DISPLAY_NAME_PREFIX}${String(numericSuffix).padStart(AUTO_DISPLAY_NAME_DIGITS, "0")}`;
}

export function isInternalIdentifierDisplayName(
  displayName: string,
  userId: string,
): boolean {
  return (
    displayName === userId ||
    INTERNAL_IDENTIFIER_PATTERNS.some((pattern) => pattern.test(displayName))
  );
}

export function resolvePublicDisplayName(
  displayName: string | null | undefined,
  userId: string
): string {
  const normalizedName = displayName?.trim();

  if (
    !normalizedName ||
    isInternalIdentifierDisplayName(normalizedName, userId)
  ) {
    return buildAutoDisplayName(userId);
  }

  return normalizedName;
}

const AUTO_DISPLAY_NAME_PREFIX = 'userID';
const AUTO_DISPLAY_NAME_RANGE = 1000;

const INTERNAL_IDENTIFIER_PATTERNS = [
  /^[0-9A-Z]{26}$/i,
  /^[0-9a-f]{32,64}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
];

export function buildAutoPlayerName(playerId: string): string {
  let hash = 0;

  for (const character of playerId) {
    hash = (hash * 31 + character.charCodeAt(0)) % AUTO_DISPLAY_NAME_RANGE;
  }

  const numericSuffix = hash === 0 ? 1 : hash;
  return `${AUTO_DISPLAY_NAME_PREFIX}${String(numericSuffix).padStart(3, '0')}`;
}

export function isInternalIdentifierPlayerName(
  displayName: string,
  playerId: string,
): boolean {
  return (
    displayName === playerId ||
    INTERNAL_IDENTIFIER_PATTERNS.some((pattern) => pattern.test(displayName))
  );
}

export function resolvePlayerName(
  displayName: string | null | undefined,
  playerId: string,
): string {
  const normalizedName = displayName?.trim();

  if (
    !normalizedName ||
    isInternalIdentifierPlayerName(normalizedName, playerId)
  ) {
    return buildAutoPlayerName(playerId);
  }

  return normalizedName;
}

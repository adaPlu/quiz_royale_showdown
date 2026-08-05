const AUTO_DISPLAY_NAME_PREFIX = 'userID';
const AUTO_DISPLAY_NAME_RANGE = 1000;

export function buildAutoPlayerName(playerId: string): string {
  let hash = 0;

  for (const character of playerId) {
    hash = (hash * 31 + character.charCodeAt(0)) % AUTO_DISPLAY_NAME_RANGE;
  }

  const numericSuffix = hash === 0 ? 1 : hash;
  return `${AUTO_DISPLAY_NAME_PREFIX}${String(numericSuffix).padStart(3, '0')}`;
}

export function resolvePlayerName(
  displayName: string | null | undefined,
  playerId: string,
): string {
  const normalizedName = displayName?.trim();
  return normalizedName || buildAutoPlayerName(playerId);
}

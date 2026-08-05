export interface TestUserIdentity {
  email: string;
  displayName?: string | null;
}

const AUTOMATED_TEST_EMAIL_PREFIXES = [
  "phase1-smoke-",
  "phase2-smoke-",
  "loadtest_",
];

const AUTOMATED_TEST_NAME_PATTERNS = [
  /^Smoke \d+$/i,
  /^Phase2 Smoke \d+$/i,
  /^VU-\d+$/i,
];

/**
 * Identifies accounts created by the repository's smoke/load scripts.
 * These accounts must stay isolated from normal player rooms.
 */
export function isAutomatedTestUser(user: TestUserIdentity): boolean {
  const email = user.email.trim().toLowerCase();
  const displayName = user.displayName?.trim() ?? "";
  const isScriptEmail =
    email.endsWith("@example.com") &&
    AUTOMATED_TEST_EMAIL_PREFIXES.some((prefix) => email.startsWith(prefix));
  const isScriptName = AUTOMATED_TEST_NAME_PATTERNS.some((pattern) =>
    pattern.test(displayName)
  );

  return isScriptEmail || isScriptName;
}

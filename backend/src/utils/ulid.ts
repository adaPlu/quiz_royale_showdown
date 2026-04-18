/**
 * ULID generator wrapper.
 *
 * Universally Unique Lexicographically Sortable Identifiers.
 * - 26 characters (Crockford Base32)
 * - Time-sortable (first 10 chars = epoch milliseconds)
 * - URL-safe, no hyphens
 * - Collision-resistant (80 random bits per millisecond)
 *
 * Use `generateId()` everywhere a primary key is needed.
 */

import { ulid, decodeTime } from "ulid";

/**
 * Generate a new ULID string.
 *
 * @param seedTime - Optional epoch timestamp in milliseconds.
 *                   Useful for testing with deterministic time.
 */
export function generateId(seedTime?: number): string {
  return ulid(seedTime);
}

/**
 * Extract the timestamp embedded in a ULID.
 *
 * @returns Epoch milliseconds
 */
export function getIdTimestamp(id: string): number {
  return decodeTime(id);
}

/**
 * Returns true if the string is a valid 26-char ULID.
 */
export function isValidId(id: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id);
}

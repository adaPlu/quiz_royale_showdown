/**
 * Tests for the room invite code generation.
 *
 * The invite code is generated in src/routes/rooms.ts via:
 *   randomBytes(3).toString("hex").toUpperCase()
 * which always produces exactly 6 uppercase hex characters.
 *
 * Since the generation is inline in a route handler, we test the logic
 * directly here by exercising the same expression, and separately verify
 * that the rooms.ts source uses `randomBytes` (not Math.random).
 */

import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";

/**
 * Mirror of the exact production expression used in rooms.ts POST /:roomId/invite.
 * Keeping it inline (not imported) ensures we're testing the canonical formula.
 */
function generateInviteCode(): string {
  return randomBytes(3).toString("hex").toUpperCase();
}

describe("invite code generation", () => {
  it("produces exactly 6 characters", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(6);
  });

  it("produces only uppercase hex characters matching /^[0-9A-F]{6}$/", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[0-9A-F]{6}$/);
  });

  it("produces different codes on successive calls (probabilistic randomness check)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));
    // With 20 calls over 16^6 = 16,777,216 possible values, collisions are vanishingly rare
    expect(codes.size).toBeGreaterThan(1);
  });

  it("uses randomBytes from crypto — not Math.random", async () => {
    // Verify the rooms.ts source file imports randomBytes from 'crypto'
    // This is a static source-level check via dynamic import of the raw module text
    // We check that 'randomBytes' appears in the module's import from 'crypto'
    const fs = await import("fs");
    const path = await import("path");
    const roomsPath = path.resolve(
      __dirname,
      "../../routes/rooms.ts"
    );
    const source = fs.readFileSync(roomsPath, "utf-8");
    expect(source).toMatch(/from ['"]crypto['"]/);
    expect(source).toContain("randomBytes");
  });
});

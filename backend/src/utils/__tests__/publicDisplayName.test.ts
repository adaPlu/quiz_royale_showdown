import { describe, expect, it } from "vitest";

import {
  buildAutoDisplayName,
  resolvePublicDisplayName,
} from "../publicDisplayName";

describe("public display names", () => {
  it("builds a stable userID### fallback without exposing the original id", () => {
    const userId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const generatedName = buildAutoDisplayName(userId);

    expect(generatedName).toMatch(/^userID\d{3}$/);
    expect(generatedName).toBe(buildAutoDisplayName(userId));
    expect(generatedName).not.toContain(userId);
  });

  it("keeps a supplied player name and trims whitespace", () => {
    expect(resolvePublicDisplayName("  Adam  ", "user-id")).toBe("Adam");
  });

  it("uses the generated fallback for blank names", () => {
    expect(resolvePublicDisplayName("   ", "user-id")).toMatch(/^userID\d{3}$/);
  });
});

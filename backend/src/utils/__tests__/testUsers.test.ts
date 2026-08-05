import { describe, expect, it } from "vitest";

import { isAutomatedTestUser } from "../testUsers";

describe("automated test user detection", () => {
  it("detects smoke-test accounts", () => {
    expect(
      isAutomatedTestUser({
        email: "phase1-smoke-123-1@example.com",
        displayName: "Smoke 1",
      })
    ).toBe(true);
  });

  it("detects load-test accounts", () => {
    expect(
      isAutomatedTestUser({
        email: "loadtest_3_2@example.com",
        displayName: "VU-3",
      })
    ).toBe(true);
  });

  it("does not classify normal accounts by display name alone", () => {
    expect(
      isAutomatedTestUser({
        email: "player@quizroyale.com",
        displayName: "Smoke 1",
      })
    ).toBe(false);
  });
});

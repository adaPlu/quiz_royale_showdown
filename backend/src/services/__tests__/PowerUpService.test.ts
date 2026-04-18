import { describe, expect, it } from "vitest";

import { normalizePowerUpCode, selectWrongAnswerIndices } from "../PowerUpService";

describe("PowerUpService helpers", () => {
  it("normalizes supported power-up codes", () => {
    expect(normalizePowerUpCode("fifty_fifty")).toBe("FIFTY_FIFTY");
    expect(normalizePowerUpCode("TIME_FREEZE")).toBe("TIME_FREEZE");
  });

  it("selects wrong answer indices without returning the correct index", () => {
    const selected = selectWrongAnswerIndices(2, 2, () => 0);

    expect(selected).toHaveLength(2);
    expect(selected).not.toContain(2);
    expect(new Set(selected).size).toBe(2);
  });
});

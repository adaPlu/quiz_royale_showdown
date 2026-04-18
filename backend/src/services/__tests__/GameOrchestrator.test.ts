import { describe, expect, it } from "vitest";

import { computeEliminationCount } from "../GameOrchestrator";

describe("GameOrchestrator helpers", () => {
  it("keeps at least two survivors during scheduled eliminations", () => {
    expect(computeEliminationCount(2)).toBe(0);
    expect(computeEliminationCount(3)).toBe(1);
    expect(computeEliminationCount(8)).toBe(1);
    expect(computeEliminationCount(100)).toBe(20);
  });
});

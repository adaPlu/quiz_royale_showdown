import { Difficulty } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildQuestionDifficultyPlan,
  getAllowedQuestionDifficulties,
} from "../GameDifficultyService";

const keepOrder = () => 0;

describe("GameDifficultyService", () => {
  it("uses only easy questions in easy mode", () => {
    expect(buildQuestionDifficultyPlan("easy", 10, keepOrder)).toEqual(
      Array(10).fill(Difficulty.EASY),
    );
    expect(getAllowedQuestionDifficulties("easy")).toEqual([Difficulty.EASY]);
  });

  it("builds an even easy and medium mix for medium mode", () => {
    const plan = buildQuestionDifficultyPlan("medium", 10, keepOrder);

    expect(plan).toHaveLength(10);
    expect(plan.filter((value) => value === Difficulty.EASY)).toHaveLength(5);
    expect(plan.filter((value) => value === Difficulty.MEDIUM)).toHaveLength(5);
    expect(plan).not.toContain(Difficulty.HARD);
  });

  it("builds an even medium and hard mix for hard mode", () => {
    const plan = buildQuestionDifficultyPlan("hard", 10, keepOrder);

    expect(plan).toHaveLength(10);
    expect(plan.filter((value) => value === Difficulty.MEDIUM)).toHaveLength(5);
    expect(plan.filter((value) => value === Difficulty.HARD)).toHaveLength(5);
    expect(plan).not.toContain(Difficulty.EASY);
  });
});

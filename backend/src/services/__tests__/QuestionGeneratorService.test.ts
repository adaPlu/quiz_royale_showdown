/**
 * Tests for QuestionGeneratorService
 *
 * Critical paths:
 *  - isAvailable reflects whether OPENAI_API_KEY is set
 *  - generateAndStore returns 0 and logs warn when no client
 *  - refillIfNeeded skips when count >= threshold
 *  - refillIfNeeded triggers generateAndStore when count < threshold
 *  - storeQuestion dedup: skips and does not count a duplicate question
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockFindFirst, mockCount } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindFirst: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock("openai", () => {
  const mockChatCompletionsCreate = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            questions: [
              {
                prompt: "What is 2+2?",
                optionA: "3",
                optionB: "4",
                optionC: "5",
                optionD: "6",
                correctIndex: 1,
                category: "Math",
                difficulty: "EASY",
              },
            ],
          }),
        },
      },
    ],
  });

  return {
    default: vi.fn().mockImplementation(function OpenAI() {
      return {
        chat: {
          completions: {
            create: mockChatCompletionsCreate,
          },
        },
      };
    }),
  };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(function PrismaClient() {
    return {
      questionBank: {
        count: mockCount,
        findFirst: mockFindFirst,
        create: mockCreate,
      },
    };
  }),
  Difficulty: { EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD" },
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { QuestionGeneratorService } from "../QuestionGeneratorService";
import { logger } from "../../utils/logger";

describe("QuestionGeneratorService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockFindFirst.mockResolvedValue(null);
    mockCount.mockResolvedValue(0);
  });

  describe("isAvailable", () => {
    it("returns false when OPENAI_API_KEY is not set", () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const service = new QuestionGeneratorService();
      expect(service.isAvailable).toBe(false);

      if (originalKey !== undefined) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    });

    it("returns true when OPENAI_API_KEY is set", () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-key-123";

      const service = new QuestionGeneratorService();
      expect(service.isAvailable).toBe(true);

      if (originalKey !== undefined) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });
  });

  describe("generateAndStore", () => {
    it("returns 0 and logs warn when client is null (no API key)", async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const service = new QuestionGeneratorService();
      const result = await service.generateAndStore();

      expect(result).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("OPENAI_API_KEY not set"),
      );

      if (originalKey !== undefined) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    });

    it("skips and counts a question as 0 when it already exists in DB (dedup)", async () => {
      process.env.OPENAI_API_KEY = "test-key-123";

      // Return an existing question to trigger dedup path
      mockFindFirst.mockResolvedValue({ id: "existing-q-id", prompt: "What is 2+2?" });

      const service = new QuestionGeneratorService();
      const result = await service.generateAndStore(30);

      // storeQuestion returns false when duplicate found, so it does not count it
      expect(mockCreate).not.toHaveBeenCalled();
      // The overall result should be 0 (no new questions stored)
      expect(result).toBe(0);

      delete process.env.OPENAI_API_KEY;
    });
  });

  describe("refillIfNeeded", () => {
    it("does nothing when count >= REFILL_THRESHOLD (500)", async () => {
      process.env.OPENAI_API_KEY = "test-key-123";
      mockCount.mockResolvedValue(500);

      const service = new QuestionGeneratorService();
      await service.refillIfNeeded();

      // No questions should be generated
      expect(mockCreate).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("triggering AI refill"),
        expect.anything(),
      );

      delete process.env.OPENAI_API_KEY;
    });

    it("calls generateAndStore when count < threshold", async () => {
      process.env.OPENAI_API_KEY = "test-key-123";
      mockCount.mockResolvedValue(100);

      const service = new QuestionGeneratorService();
      await service.refillIfNeeded();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("triggering AI refill"),
        expect.objectContaining({ count: 100, threshold: 500 }),
      );

      delete process.env.OPENAI_API_KEY;
    });
  });
});

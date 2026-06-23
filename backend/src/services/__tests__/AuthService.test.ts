import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const tx = {
    refreshToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };

  return {
    tx,
    refreshToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock("../../models/prismaClient", () => ({
  prisma: prismaMock,
}));

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("consumes a refresh token atomically so replay cannot mint another pair", async () => {
    const { rotateRefreshToken, signTokenPair } = await import("../AuthService");
    const user = {
      id: "01HX0000000000000000000000",
      email: "player@example.com",
      displayName: "Player",
    };
    const incomingRefreshToken = signTokenPair(user).refreshToken;

    prismaMock.tx.refreshToken.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    prismaMock.tx.user.findUnique.mockResolvedValue(user);
    prismaMock.tx.refreshToken.create.mockResolvedValue(undefined);

    const rotated = await rotateRefreshToken(incomingRefreshToken);

    await expect(rotateRefreshToken(incomingRefreshToken)).rejects.toMatchObject({
      message: "Refresh token revoked",
      status: 401,
    });
    expect(rotated.refreshToken).not.toBe(incomingRefreshToken);
    expect(prismaMock.tx.refreshToken.deleteMany).toHaveBeenCalledTimes(3);
    expect(prismaMock.tx.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.tx.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.tx.refreshToken.deleteMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          userId: user.id,
          expiresAt: { gt: expect.any(Date) },
        }),
      })
    );
    expect(prismaMock.tx.refreshToken.deleteMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId: user.id,
          expiresAt: { lt: expect.any(Date) },
        },
      })
    );
  });
});

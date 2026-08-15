import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const tx = {
    refreshToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      // SEC-11: rotateRefreshToken now distinguishes a replay from a stale row.
      findFirst: vi.fn(),
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
      .mockResolvedValueOnce({ count: 0 });
    prismaMock.tx.user.findUnique.mockResolvedValue(user);
    prismaMock.tx.refreshToken.create.mockResolvedValue(undefined);

    const rotated = await rotateRefreshToken(incomingRefreshToken);

    // SEC-11: this second call is a replay of a consumed token. It is still
    // rejected with 401 and still mints nothing; the message now names the
    // reuse, and the family is swept so the attacker's chain dies with it.
    await expect(rotateRefreshToken(incomingRefreshToken)).rejects.toMatchObject({
      message: "Refresh token reuse detected",
      status: 401,
    });
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
    expect(rotated.refreshToken).not.toBe(incomingRefreshToken);
    // Two single-use consume attempts inside transactions (the rotation, then
    // the replay). The SEC-11 sweep is NOT here — it runs on the top-level
    // client after rollback, asserted above.
    expect(prismaMock.tx.refreshToken.deleteMany).toHaveBeenCalledTimes(2);
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
  });
});

describe("rotateRefreshToken — refresh reuse detection (SEC-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A replay is the one signal that a refresh token was stolen. Rotation is
  // single-use, so a validly-signed, unexpired token whose hash is already gone
  // was consumed by someone else. Previously this threw a plain 401 and left
  // every sibling token alive, so the attacker's chain survived the full TTL.
  it("revokes every token in the family when a consumed token is replayed", async () => {
    const { rotateRefreshToken, signTokenPair } = await import("../AuthService");
    const token = signTokenPair({ id: "user-1", email: "a@b.c", displayName: "A" }).refreshToken;

    // Hash absent -> already consumed -> replay.
    prismaMock.tx.refreshToken.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(rotateRefreshToken(token)).rejects.toThrow(/reuse detected/i);

    // The family sweep must be scoped to the user and carry no tokenHash,
    // otherwise it only deletes the token that was already gone.
    // Must be the TOP-LEVEL client, not tx: Prisma rolls the interactive
    // transaction back when the callback throws, so a sweep issued on `tx`
    // would be silently undone. Asserting on tx here would pass against a
    // broken fix.
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(prismaMock.tx.refreshToken.deleteMany).not.toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, verifyAccessTokenMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
  },
  verifyAccessTokenMock: vi.fn(),
}));

vi.mock("../../models/prismaClient", () => ({ prisma: prismaMock }));
vi.mock("../../services/AuthService", () => ({ verifyAccessToken: verifyAccessTokenMock }));
vi.mock("../../utils/logger", () => ({
  logger: {
    debug: vi.fn(),
  },
}));

import { socketAuthMiddleware } from "../middleware";

function createSocket(token = "access-token") {
  return {
    id: "socket-1",
    data: {},
    handshake: {
      auth: { token },
      headers: {},
    },
  };
}

describe("socketAuthMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessTokenMock.mockReturnValue({
      sub: "user-1",
      email: "claim@example.com",
      displayName: "Claim Name",
    });
  });

  it("authenticates with the existing database user, not JWT profile claims", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "db@example.com",
      displayName: "DB Name",
    });
    const socket = createSocket();
    const next = vi.fn();

    await socketAuthMiddleware(socket as never, next);

    expect(socket.data).toEqual({
      userId: "user-1",
      email: "db@example.com",
      displayName: "DB Name",
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects when the JWT subject does not resolve to a database user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const socket = createSocket();
    const next = vi.fn();

    await socketAuthMiddleware(socket as never, next);

    expect(socket.data).toEqual({});
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "User not found" }));
  });

  it("rejects instead of falling back to JWT claims when the database lookup fails", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("database unavailable"));
    const socket = createSocket();
    const next = vi.fn();

    await socketAuthMiddleware(socket as never, next);

    expect(socket.data).toEqual({});
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Unauthorized" }));
  });
});

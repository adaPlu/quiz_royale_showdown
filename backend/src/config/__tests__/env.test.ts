import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const PROD_ENV = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "prod-access-secret-at-least-32-chars",
  JWT_REFRESH_SECRET: "prod-refresh-secret-at-least-32-chars",
  DATABASE_URL: "postgresql://prod-user:prod-pass@prod-db:5432/quiz_royale",
  REDIS_URL: "redis://prod-redis:6379",
  ADMIN_SECRET: "prod-admin-secret-at-least-32-chars",
} as const;

const DEV_DEFAULTS = {
  JWT_ACCESS_SECRET: "dev-access-secret-change-in-production",
  JWT_REFRESH_SECRET: "dev-refresh-secret-change-in-production",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/quiz_royale?schema=public",
  REDIS_URL: "redis://localhost:6379",
  ADMIN_SECRET: "change-me-in-production",
} as const;

function setEnv(values: NodeJS.ProcessEnv) {
  process.env = { ...ORIGINAL_ENV, ...values };
}

describe("env", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("keeps development defaults available outside production", async () => {
    setEnv({
      NODE_ENV: "development",
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
      DATABASE_URL: undefined,
      REDIS_URL: undefined,
      ADMIN_SECRET: undefined,
    });

    const { env } = await import("../env");

    expect(env.isDevelopment).toBe(true);
    expect(env.jwtAccessSecret).toBe(DEV_DEFAULTS.JWT_ACCESS_SECRET);
    expect(env.jwtRefreshSecret).toBe(DEV_DEFAULTS.JWT_REFRESH_SECRET);
    expect(env.databaseUrl).toBe(DEV_DEFAULTS.DATABASE_URL);
    expect(env.redisUrl).toBe(DEV_DEFAULTS.REDIS_URL);
    expect(env.adminSecret).toBe(DEV_DEFAULTS.ADMIN_SECRET);
  });

  it("fails fast in production when required secrets are missing", async () => {
    setEnv({
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
      DATABASE_URL: undefined,
      REDIS_URL: undefined,
      ADMIN_SECRET: undefined,
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit 1");
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(import("../env")).rejects.toThrow("process.exit 1");

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith("  JWT_ACCESS_SECRET is required in production");
    expect(error).toHaveBeenCalledWith("  JWT_REFRESH_SECRET is required in production");
    expect(error).toHaveBeenCalledWith("  DATABASE_URL is required in production");
    expect(error).toHaveBeenCalledWith("  REDIS_URL is required in production");
    expect(error).toHaveBeenCalledWith("  ADMIN_SECRET is required in production");
  });

  it("fails fast in production when audited secrets use development placeholders", async () => {
    setEnv({
      ...PROD_ENV,
      ...DEV_DEFAULTS,
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit 1");
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(import("../env")).rejects.toThrow("process.exit 1");

    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      "  JWT_ACCESS_SECRET must not use a development placeholder in production"
    );
    expect(error).toHaveBeenCalledWith(
      "  JWT_REFRESH_SECRET must not use a development placeholder in production"
    );
    expect(error).toHaveBeenCalledWith(
      "  DATABASE_URL must not use a development placeholder in production"
    );
    expect(error).toHaveBeenCalledWith(
      "  REDIS_URL must not use a development placeholder in production"
    );
    expect(error).toHaveBeenCalledWith(
      "  ADMIN_SECRET must not use a development placeholder in production"
    );
  });

  it("accepts explicit production secrets", async () => {
    setEnv(PROD_ENV);

    const { env } = await import("../env");

    expect(env.isProduction).toBe(true);
    expect(env.jwtAccessSecret).toBe(PROD_ENV.JWT_ACCESS_SECRET);
    expect(env.redisUrl).toBe(PROD_ENV.REDIS_URL);
  });
});

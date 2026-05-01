/**
 * Environment configuration with Zod validation.
 *
 * All environment variables are validated at startup.
 * A missing or invalid required variable causes the process to exit(1) immediately,
 * preventing the app from starting in a broken state.
 */

import "dotenv/config";
import { z } from "zod";

const DEV_DEFAULTS = {
  JWT_ACCESS_SECRET: "dev-access-secret-change-in-production",
  JWT_REFRESH_SECRET: "dev-refresh-secret-change-in-production",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/quiz_royale?schema=public",
  REDIS_URL: "redis://localhost:6379",
  ADMIN_SECRET: "change-me-in-production",
} as const;

const PRODUCTION_REQUIRED_KEYS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
  "ADMIN_SECRET",
] as const;

const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // CORS
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // JWT
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, "JWT_ACCESS_SECRET must be at least 16 characters")
    .default(DEV_DEFAULTS.JWT_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, "JWT_REFRESH_SECRET must be at least 16 characters")
    .default(DEV_DEFAULTS.JWT_REFRESH_SECRET),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),

  // Database
  DATABASE_URL: z
    .string()
    .default(DEV_DEFAULTS.DATABASE_URL),

  // Redis
  REDIS_URL: z.string().default(DEV_DEFAULTS.REDIS_URL),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:adapluguez@gmail.com"),

  // AI question generation
  OPENAI_API_KEY: z.string().optional(),
  ADMIN_SECRET: z.string().default(DEV_DEFAULTS.ADMIN_SECRET),
});

function getProductionEnvErrors(rawEnv: NodeJS.ProcessEnv): string[] {
  if (rawEnv.NODE_ENV !== "production") {
    return [];
  }

  const errors: string[] = [];

  for (const key of PRODUCTION_REQUIRED_KEYS) {
    const value = rawEnv[key]?.trim();

    if (!value) {
      errors.push(`${key} is required in production`);
      continue;
    }

    if (value === DEV_DEFAULTS[key] || /^change-me/i.test(value)) {
      errors.push(`${key} must not use a development placeholder in production`);
    }
  }

  return errors;
}

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  const productionErrors = getProductionEnvErrors(process.env);

  if (!result.success || productionErrors.length > 0) {
    console.error("❌ Invalid environment configuration:");
    if (!result.success) {
      const formatted = result.error.flatten().fieldErrors;
      for (const [field, messages] of Object.entries(formatted)) {
        console.error(`  ${field}: ${(messages ?? []).join(", ")}`);
      }
    }

    for (const message of productionErrors) {
      console.error(`  ${message}`);
    }
    process.exit(1);
  }

  return result.data;
}

const parsed = parseEnv();

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  corsOrigin: parsed.CORS_ORIGIN,
  jwtAccessSecret: parsed.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.JWT_REFRESH_SECRET,
  jwtAccessTtl: parsed.JWT_ACCESS_TTL,
  jwtRefreshTtl: parsed.JWT_REFRESH_TTL,
  databaseUrl: parsed.DATABASE_URL,
  redisUrl: parsed.REDIS_URL,
  logLevel: parsed.LOG_LEVEL,
  vapidPublicKey: parsed.VAPID_PUBLIC_KEY,
  vapidPrivateKey: parsed.VAPID_PRIVATE_KEY,
  vapidSubject: parsed.VAPID_SUBJECT,
  openAiApiKey: parsed.OPENAI_API_KEY,
  adminSecret: parsed.ADMIN_SECRET,
  isProduction: parsed.NODE_ENV === "production",
  isDevelopment: parsed.NODE_ENV === "development",
  isTest: parsed.NODE_ENV === "test",
} as const;

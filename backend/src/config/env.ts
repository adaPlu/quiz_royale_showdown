/**
 * Environment configuration with Zod validation.
 *
 * All environment variables are validated at startup. A missing or invalid
 * required variable causes the process to exit immediately.
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

const PRODUCTION_PLACEHOLDER_VALUES: Partial<Record<(typeof PRODUCTION_REQUIRED_KEYS)[number], string>> = {
  JWT_ACCESS_SECRET: DEV_DEFAULTS.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: DEV_DEFAULTS.JWT_REFRESH_SECRET,
  DATABASE_URL: DEV_DEFAULTS.DATABASE_URL,
  REDIS_URL: DEV_DEFAULTS.REDIS_URL,
  ADMIN_SECRET: DEV_DEFAULTS.ADMIN_SECRET,
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),

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

  DATABASE_URL: z.string().default(DEV_DEFAULTS.DATABASE_URL),
  REDIS_URL: z.string().default(DEV_DEFAULTS.REDIS_URL),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:adapluguez@gmail.com"),

  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_QUESTION_MODEL: z.string().trim().min(1).default("gpt-5-mini"),
  QUESTION_REFILL_THRESHOLD: z.coerce.number().int().min(10).max(500).default(60),
  QUESTION_REFILL_BATCH_SIZE: z.coerce.number().int().min(10).max(60).default(30),
  QUESTION_DAILY_GENERATION_LIMIT: z.coerce.number().int().min(60).max(5000).default(300),

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

    if (value === PRODUCTION_PLACEHOLDER_VALUES[key] || /^change-me/i.test(value)) {
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
const corsOrigins = parsed.CORS_ORIGIN
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  console.error("❌ Invalid environment configuration:\n  CORS_ORIGIN must contain at least one origin");
  process.exit(1);
}

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  corsOrigins,
  corsOrigin: corsOrigins[0],
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
  openAiQuestionModel: parsed.OPENAI_QUESTION_MODEL,
  questionRefillThreshold: parsed.QUESTION_REFILL_THRESHOLD,
  questionRefillBatchSize: parsed.QUESTION_REFILL_BATCH_SIZE,
  questionDailyGenerationLimit: parsed.QUESTION_DAILY_GENERATION_LIMIT,
  adminSecret: parsed.ADMIN_SECRET,
  isProduction: parsed.NODE_ENV === "production",
  isDevelopment: parsed.NODE_ENV === "development",
  isTest: parsed.NODE_ENV === "test",
} as const;

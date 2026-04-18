/**
 * Structured logger for Quiz Royale backend.
 *
 * In production, outputs newline-delimited JSON (NDJSON) suitable for
 * log aggregators (Datadog, Loki, CloudWatch).
 * In development, pretty-prints with coloured level prefixes.
 */

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: "\x1b[90m",
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[35m"
};

const RESET = "\x1b[0m";

const configuredLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const isDev = process.env.NODE_ENV !== "production";

function write(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[configuredLevel]) {
    return;
  }

  const now = new Date().toISOString();

  if (isDev) {
    const color = LEVEL_COLORS[level];
    const prefix = `${color}[${level.toUpperCase().padEnd(5)}]${RESET}`;
    const extra = data ? " " + JSON.stringify(data) : "";
    process.stdout.write(`${prefix} ${now} ${msg}${extra}\n`);
  } else {
    const entry: Record<string, unknown> = {
      level: LEVEL_PRIORITY[level],
      levelName: level,
      time: now,
      msg,
      ...data
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

export const logger = {
  trace: (msg: string, data?: Record<string, unknown>) => write("trace", msg, data),
  debug: (msg: string, data?: Record<string, unknown>) => write("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("error", msg, data),
  fatal: (msg: string, data?: Record<string, unknown>) => write("fatal", msg, data),

  /** Returns a child logger that merges extra fields into every entry. */
  child(bindings: Record<string, unknown>): typeof logger {
    const child: typeof logger = {} as typeof logger;
    const levels: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];
    for (const level of levels) {
      child[level] = (msg: string, data?: Record<string, unknown>) =>
        write(level, msg, { ...bindings, ...data });
    }
    child.child = (extra) => logger.child({ ...bindings, ...extra });
    return child;
  }
};

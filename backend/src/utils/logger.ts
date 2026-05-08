/**
 * Structured logger for Quiz Royale backend.
 *
 * Wraps pino so all existing call-sites keep the (msg, data?) signature.
 * In production, outputs NDJSON suitable for Railway / log aggregators.
 * In development, uses pino-pretty for colourised, human-readable output.
 */

import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const pinoInstance = pino(
  isProd
    ? {
        level: process.env.LOG_LEVEL ?? 'info',
      }
    : {
        level: process.env.LOG_LEVEL ?? 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }
);

type LogFn = (msg: string, data?: Record<string, unknown>) => void;

export interface Logger {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  child(bindings: Record<string, unknown>): Logger;
}

function wrap(base: pino.Logger): Logger {
  return {
    trace: (msg, data) => (data ? base.trace(data, msg) : base.trace(msg)),
    debug: (msg, data) => (data ? base.debug(data, msg) : base.debug(msg)),
    info:  (msg, data) => (data ? base.info(data, msg)  : base.info(msg)),
    warn:  (msg, data) => (data ? base.warn(data, msg)  : base.warn(msg)),
    error: (msg, data) => (data ? base.error(data, msg) : base.error(msg)),
    fatal: (msg, data) => (data ? base.fatal(data, msg) : base.fatal(msg)),
    child: (bindings) => wrap(base.child(bindings)),
  };
}

export const logger = wrap(pinoInstance);

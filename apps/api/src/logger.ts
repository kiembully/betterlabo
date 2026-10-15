/**
 * A dependency-free structured logger.
 *
 * Output is one JSON object per line so a platform log drain can index it, and
 * the level is a process-wide threshold rather than per-call noise. Nothing
 * here ever logs a request body — citizen reports carry personal contact data.
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const RANK: Record<Exclude<LogLevel, 'silent'>, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let threshold = RANK.info;

export function setLogLevel(level: LogLevel): void {
  threshold = level === 'silent' ? -1 : RANK[level];
}

export type LogMeta = Record<string, unknown>;

function emit(level: Exclude<LogLevel, 'silent'>, message: string, meta?: LogMeta): void {
  if (RANK[level] > threshold) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(meta ?? {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  error: (message: string, meta?: LogMeta): void => emit('error', message, meta),
  warn: (message: string, meta?: LogMeta): void => emit('warn', message, meta),
  info: (message: string, meta?: LogMeta): void => emit('info', message, meta),
  debug: (message: string, meta?: LogMeta): void => emit('debug', message, meta),
};

/** `err.message` for an `Error`, `String(err)` otherwise. Never throws. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

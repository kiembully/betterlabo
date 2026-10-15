/**
 * Server entry point.
 *
 * Importing this module has no side effects: `createApp` and the config helpers
 * are re-exported so the Next server can mount the exact same Express app
 * in-process for the `/api/*` bridge. The HTTP listener starts only when this
 * file is the process entry (see `isDirectRun`).
 */
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import type { AppConfig } from './config.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { errorMessage, log, setLogLevel } from './logger.js';

export { createApp } from './app.js';
export type { AppConfig, ConfigOverrides } from './config.js';
export { loadConfig } from './config.js';
export { connectDatabase, disconnectDatabase, isDatabaseConnected } from './db.js';
export { getDefaultRegistry, createBarangayRegistry } from './barangays.js';
export type { BarangayRegistry } from './barangays.js';
export { AppError, fail } from './errors.js';

const SHUTDOWN_GRACE_MS = 5_000;

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    if (pathToFileURL(entry).href === import.meta.url) return true;
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function reportDegradations(config: AppConfig): void {
  if (config.mongodbUri === '') {
    log.warn(
      'MONGODB_URI is not set — starting in no-database mode; reporting answers 503 db_unavailable and every public page still renders from cached JSON',
    );
  }
  if (config.adminToken === '') {
    log.warn('ADMIN_TOKEN is not set — the admin console endpoints are closed on this deployment');
  }
  if (config.turnstile.mode === 'off') {
    log.warn('TURNSTILE_MODE=off — report submissions are not captcha-protected');
  }
  if (config.webhookUrl === null) {
    log.info('REPORT_WEBHOOK_URL is not set — new reports are not forwarded anywhere');
  }
}

async function start(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  if (config.envFile) log.info('loaded environment file', { file: config.envFile });
  reportDegradations(config);

  const app = createApp({ config });

  if (config.mongodbUri !== '') {
    try {
      await connectDatabase(config.mongodbUri, { dbName: config.mongodbDb });
      log.info('database connected', { db: config.mongodbDb });
    } catch (err) {
      log.error('database connection failed — continuing in no-database mode', {
        error: errorMessage(err),
      });
    }
  }

  const server = app.listen(config.port, () => {
    log.info('BetterLabo API listening', { url: `http://localhost:${config.port}` });
  });

  const shutdown = (signal: string): void => {
    log.info('shutting down', { signal });
    const timer = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
    timer.unref();
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (isDirectRun()) {
  void start().catch((err: unknown) => {
    log.error('the API failed to start', { error: errorMessage(err) });
    process.exitCode = 1;
  });
}

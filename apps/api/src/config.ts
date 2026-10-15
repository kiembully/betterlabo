/**
 * Runtime configuration, read once from the environment.
 *
 * `loadConfig()` is pure with respect to the network: it only reads `process.env`
 * (already populated by `env.ts`) and never throws for a missing value. Two
 * degradations are deliberate and documented in `.env.example`:
 *
 *  - `TURNSTILE_MODE=enforce` with no secret falls back to `off` with a warning,
 *    because a captcha the server cannot verify would reject every citizen.
 *  - an unset `ADMIN_TOKEN` simply disables the admin console endpoints (403).
 */
import './env.js';
import { loadedEnvFile } from './env.js';
import type { LogLevel } from './logger.js';

export type TurnstileMode = 'off' | 'enforce';

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  mongodbUri: string;
  mongodbDb: string;
  corsOrigins: string[];
  adminToken: string;
  adminSessionSecret: string;
  turnstile: { mode: TurnstileMode; secretKey: string };
  rateLimit: { windowMs: number; max: number };
  webhookUrl: string | null;
  trustProxy: boolean;
  logLevel: LogLevel;
  /** The repo-root env file that was read, for the boot log. */
  envFile: string | null;
}

/** Explicit per-field overrides — used by the dev/seed/smoke harness. */
export interface ConfigOverrides {
  nodeEnv?: string;
  port?: number;
  mongodbUri?: string;
  mongodbDb?: string;
  corsOrigins?: string[];
  adminToken?: string;
  adminSessionSecret?: string;
  turnstile?: { mode: TurnstileMode; secretKey?: string };
  rateLimit?: { windowMs?: number; max?: number };
  webhookUrl?: string | null;
  trustProxy?: boolean;
  logLevel?: LogLevel;
}

function readString(name: string, fallback = ''): string {
  const raw = process.env[name];
  return raw === undefined ? fallback : raw.trim();
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = readString(name);
  if (raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = readString(name).toLowerCase();
  if (raw === '') return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function readList(name: string, fallback: string[]): string[] {
  const raw = readString(name);
  if (raw === '') return fallback;
  const items = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return items.length > 0 ? items : fallback;
}

function readLogLevel(): LogLevel {
  const raw = readString('LOG_LEVEL', 'info').toLowerCase();
  if (raw === 'silent' || raw === 'error' || raw === 'warn' || raw === 'debug') return raw;
  return 'info';
}

export function loadConfig(overrides: ConfigOverrides = {}): AppConfig {
  const nodeEnv = overrides.nodeEnv ?? readString('NODE_ENV', 'development');

  const rawMode = readString('TURNSTILE_MODE', 'off').toLowerCase();
  const mode: TurnstileMode = rawMode === 'enforce' ? 'enforce' : 'off';
  const secretKey = overrides.turnstile?.secretKey ?? readString('TURNSTILE_SECRET_KEY');

  const config: AppConfig = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: readInt('PORT', 4000, 1, 65535),
    mongodbUri: readString('MONGODB_URI'),
    mongodbDb: readString('MONGODB_DB', 'betterlabo'),
    corsOrigins: readList('CORS_ORIGINS', ['http://localhost:3000']),
    adminToken: readString('ADMIN_TOKEN'),
    adminSessionSecret: readString('ADMIN_SESSION_SECRET'),
    turnstile: { mode, secretKey },
    rateLimit: {
      windowMs: readInt('REPORT_RATE_LIMIT_WINDOW_MS', 600_000, 1_000, 86_400_000),
      max: readInt('REPORT_RATE_LIMIT_MAX', 5, 1, 10_000),
    },
    webhookUrl: readString('REPORT_WEBHOOK_URL') || null,
    trustProxy: readBool('TRUST_PROXY', false),
    logLevel: readLogLevel(),
    envFile: loadedEnvFile(),
  };

  if (overrides.port !== undefined) config.port = overrides.port;
  if (overrides.mongodbUri !== undefined) config.mongodbUri = overrides.mongodbUri;
  if (overrides.mongodbDb !== undefined) config.mongodbDb = overrides.mongodbDb;
  if (overrides.corsOrigins !== undefined) config.corsOrigins = overrides.corsOrigins;
  if (overrides.adminToken !== undefined) config.adminToken = overrides.adminToken;
  if (overrides.adminSessionSecret !== undefined) {
    config.adminSessionSecret = overrides.adminSessionSecret;
  }
  if (overrides.turnstile !== undefined) {
    config.turnstile = { mode: overrides.turnstile.mode, secretKey };
  }
  if (overrides.rateLimit !== undefined) {
    config.rateLimit = {
      windowMs: overrides.rateLimit.windowMs ?? config.rateLimit.windowMs,
      max: overrides.rateLimit.max ?? config.rateLimit.max,
    };
  }
  if (overrides.webhookUrl !== undefined) config.webhookUrl = overrides.webhookUrl;
  if (overrides.trustProxy !== undefined) config.trustProxy = overrides.trustProxy;
  if (overrides.logLevel !== undefined) config.logLevel = overrides.logLevel;

  config.isProduction = config.nodeEnv === 'production';

  if (config.turnstile.mode === 'enforce' && config.turnstile.secretKey === '') {
    config.turnstile = { mode: 'off', secretKey: '' };
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'TURNSTILE_MODE=enforce but TURNSTILE_SECRET_KEY is empty — running the captcha in off mode',
      }),
    );
  }

  return config;
}

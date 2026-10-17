/**
 * Builds the Express application. No listener, no database connection — the
 * caller owns both, which is what lets `dev-memory.ts` mount this app on an
 * ephemeral port and lets the Next server mount it in-process.
 */
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { CorsOptions } from 'cors';
import type { Express } from 'express';
import { getDefaultRegistry } from './barangays.js';
import type { BarangayRegistry } from './barangays.js';
import type { AppConfig } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { createAdminRouter } from './routes/admin.js';
import { createHealthRouter } from './routes/health.js';
import { createPublicAppointmentsRouter } from './routes/appointments.js';
import { createPublicReportsRouter } from './routes/reports.js';

export interface CreateAppOptions {
  config: AppConfig;
  /** Injectable for tests; defaults to the process-wide registry. */
  registry?: BarangayRegistry;
}

function corsOptions(origins: string[]): CorsOptions {
  if (origins.includes('*')) {
    return { origin: true, credentials: true };
  }
  return {
    // Only the origins named in CORS_ORIGINS may send a browser request from
    // another site; a same-origin or non-browser caller has no Origin header.
    origin: (origin, callback) => {
      if (!origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };
}

export function createApp(options: CreateAppOptions): Express {
  const { config } = options;
  const registry = options.registry ?? getDefaultRegistry();
  const app = express();

  app.disable('x-powered-by');
  // A numeric hop count rather than `true`: express-rate-limit treats a
  // permissive trust-proxy setting as a spoofable client IP and refuses it.
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use(
    helmet({
      // The API answers JSON only — CSP belongs to the portal, not here.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors(corsOptions(config.corsOrigins)));
  app.use(express.json({ limit: '64kb' }));
  app.use(requestLogger());

  app.use('/api', createHealthRouter());
  app.use('/api', createPublicReportsRouter({ config, registry }));
  app.use('/api', createPublicAppointmentsRouter({ config, registry }));
  app.use('/api/admin', createAdminRouter({ config, registry }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

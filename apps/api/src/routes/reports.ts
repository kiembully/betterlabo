/**
 * Public (unauthenticated) reporting routes, mounted at `/api`.
 *
 *   POST /api/reports          file a report        (rate limited, Turnstile)
 *   GET  /api/reports/lookup   track by reference code
 *   GET  /api/reports/stats    municipality-wide aggregate counts
 *
 * The submission path deliberately returns the *public* projection: the citizen
 * gets their reference code back without the service ever echoing the contact
 * details they typed.
 */
import { Router } from 'express';
import { createReportSchema, lookupReportSchema } from '@betterlabo/shared';
import type { Request } from 'express';
import type { AppConfig } from '../config.js';
import type { BarangayRegistry } from '../barangays.js';
import { assertDatabaseConnected } from '../db.js';
import { fail } from '../errors.js';
import { sendItem } from '../http.js';
import { asyncHandler } from '../lib/async-handler.js';
import { computeReportStats } from '../lib/stats.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { zodIssues } from '../lib/validation.js';
import { forwardToWebhook } from '../lib/webhook.js';
import { createReportRateLimiter } from '../middleware/rate-limit.js';
import { toPublicReport } from '../models/report.js';
import { createReport, findReportByReferenceCode } from '../services/report-service.js';

export interface PublicRoutesDeps {
  config: AppConfig;
  registry: BarangayRegistry;
}

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

export function createPublicReportsRouter(deps: PublicRoutesDeps): Router {
  const router = Router();

  router.post(
    '/reports',
    createReportRateLimiter(deps.config.rateLimit),
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = createReportSchema.safeParse(req.body);
      if (!parsed.success) {
        throw fail.validationFailed(
          'The report was not accepted as submitted. Please check the highlighted fields.',
          zodIssues(parsed.error),
        );
      }
      const input = parsed.data;

      const captcha = await verifyTurnstile({
        token: input.turnstileToken ?? null,
        remoteIp: clientIp(req),
        mode: deps.config.turnstile.mode,
        secretKey: deps.config.turnstile.secretKey,
      });
      if (!captcha.ok) {
        throw fail.captchaFailed(captcha.reason ?? 'The anti-spam check did not pass.');
      }

      const doc = await createReport(input, {
        registry: deps.registry,
        source: 'citizen',
      });
      const report = toPublicReport(doc);

      if (deps.config.webhookUrl) {
        // Best effort, after the record is durable — never awaited by the citizen.
        void forwardToWebhook(deps.config.webhookUrl, {
          event: 'report.created',
          referenceCode: report.referenceCode,
          category: report.category,
          status: report.status,
          priority: report.priority,
          barangay: report.barangayName,
          subject: report.subject,
          locationLabel: report.locationLabel,
          assignedOffice: report.assignedOffice,
          createdAt: report.createdAt,
        });
      }

      sendItem(res, report, 201);
    }),
  );

  router.get(
    '/reports/lookup',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = lookupReportSchema.safeParse(req.query);
      if (!parsed.success) {
        throw fail.validationFailed(
          'Provide a reference code in the form LB-2026-000042.',
          zodIssues(parsed.error),
        );
      }

      const doc = await findReportByReferenceCode(parsed.data.referenceCode);
      if (!doc) {
        throw fail.notFound(`No report was found for ${parsed.data.referenceCode}.`);
      }

      sendItem(res, toPublicReport(doc));
    }),
  );

  router.get(
    '/reports/stats',
    asyncHandler(async (_req, res) => {
      assertDatabaseConnected();
      // Enveloped like every other single-object response in this API.
      sendItem(res, await computeReportStats());
    }),
  );

  return router;
}

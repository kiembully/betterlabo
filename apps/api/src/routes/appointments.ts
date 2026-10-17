/**
 * Public (unauthenticated) appointment routes, mounted at `/api`.
 *
 *   POST /api/appointments          request a slot   (rate limited, Turnstile)
 *   GET  /api/appointments/lookup   track by reference code
 *
 * The submission path deliberately returns the *public* projection: the citizen
 * gets their reference code and the office back without the service ever
 * echoing the name or contact details they typed.
 */
import { Router } from 'express';
import { createAppointmentSchema, lookupAppointmentSchema } from '@betterlabo/shared';
import type { Request } from 'express';
import type { AppConfig } from '../config.js';
import type { BarangayRegistry } from '../barangays.js';
import { assertDatabaseConnected } from '../db.js';
import { fail } from '../errors.js';
import { sendItem } from '../http.js';
import { asyncHandler } from '../lib/async-handler.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { zodIssues } from '../lib/validation.js';
import { forwardToWebhook } from '../lib/webhook.js';
import { createAppointmentRateLimiter } from '../middleware/rate-limit.js';
import { toPublicAppointment } from '../models/appointment.js';
import {
  createAppointment,
  findAppointmentByReferenceCode,
} from '../services/appointment-service.js';

export interface PublicAppointmentRoutesDeps {
  config: AppConfig;
  registry: BarangayRegistry;
}

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

export function createPublicAppointmentsRouter(deps: PublicAppointmentRoutesDeps): Router {
  const router = Router();

  router.post(
    '/appointments',
    createAppointmentRateLimiter(deps.config.rateLimit),
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = createAppointmentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw fail.validationFailed(
          'The appointment request was not accepted as submitted. Please check the highlighted fields.',
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

      const doc = await createAppointment(input, {
        registry: deps.registry,
        source: 'citizen',
      });
      const appointment = toPublicAppointment(doc);

      if (deps.config.webhookUrl) {
        // Best effort, after the record is durable — never awaited by the citizen.
        void forwardToWebhook(deps.config.webhookUrl, {
          event: 'appointment.created',
          referenceCode: appointment.referenceCode,
          purpose: appointment.purpose,
          status: appointment.status,
          barangay: appointment.barangayName,
          preferredDate: appointment.preferredDate,
          preferredSlot: appointment.preferredSlot,
          scheduledDate: appointment.scheduledDate,
          scheduledSlot: appointment.scheduledSlot,
          assignedOffice: appointment.assignedOffice,
          createdAt: appointment.createdAt,
        });
      }

      sendItem(res, appointment, 201);
    }),
  );

  router.get(
    '/appointments/lookup',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = lookupAppointmentSchema.safeParse(req.query);
      if (!parsed.success) {
        throw fail.validationFailed(
          'Provide a reference code in the form APT-2026-000001.',
          zodIssues(parsed.error),
        );
      }

      const doc = await findAppointmentByReferenceCode(parsed.data.referenceCode);
      if (!doc) {
        throw fail.notFound(`No appointment was found for ${parsed.data.referenceCode}.`);
      }

      sendItem(res, toPublicAppointment(doc));
    }),
  );

  return router;
}

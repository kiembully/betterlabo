/**
 * Admin console routes, mounted at `/api/admin`.
 *
 *   POST   /api/admin/session         exchange ADMIN_TOKEN for a session token
 *   GET    /api/admin/reports         list + filter + search
 *   POST   /api/admin/reports         create on a resident's behalf
 *   GET    /api/admin/reports/:id     full record (includes contact + history)
 *   PATCH  /api/admin/reports/:id     status / priority / office / resolution
 *   DELETE /api/admin/reports/:id     remove a spam or duplicate report
 *   GET    /api/admin/appointments    list + filter + search
 *   GET    /api/admin/appointments/stats   appointment counts for the dashboard
 *   GET    /api/admin/appointments/:id     full record (includes contact + history)
 *   PATCH  /api/admin/appointments/:id     status / schedule / office
 *   DELETE /api/admin/appointments/:id     remove a spam or duplicate request
 *   GET    /api/admin/stats           dashboard aggregates
 *
 * Everything below `/session` is behind `requireAdmin`, which accepts either the
 * long-lived admin token or a signed session token.
 */
import { Router } from 'express';
import {
  createAppointmentSchema,
  createReportSchema,
  listAppointmentsQuerySchema,
  listReportsQuerySchema,
  updateAppointmentSchema,
  updateReportSchema,
} from '@betterlabo/shared';
import type { Request } from 'express';
import type { AppConfig } from '../config.js';
import type { BarangayRegistry } from '../barangays.js';
import { assertDatabaseConnected } from '../db.js';
import { fail } from '../errors.js';
import { sendItem, sendList, sendOk } from '../http.js';
import { asyncHandler } from '../lib/async-handler.js';
import { computeAppointmentStats, computeReportStats } from '../lib/stats.js';
import { zodIssues } from '../lib/validation.js';
import { adminTokenMatches, clearSessionCookie, isAdminRequest, issueAdminSession, requireAdmin, setSessionCookie } from '../middleware/auth.js';
import { toAppointment } from '../models/appointment.js';
import { toReport } from '../models/report.js';
import {
  createAppointment,
  deleteAppointment,
  findAppointmentById,
  listAppointments,
  updateAppointment,
} from '../services/appointment-service.js';
import {
  createReport,
  deleteReport,
  findReportById,
  listReports,
  updateReport,
} from '../services/report-service.js';

export interface AdminRoutesDeps {
  config: AppConfig;
  registry: BarangayRegistry;
}

/**
 * Express 5 types `req.params` values as `string | string[]`; a single-route
 * param is always a string, and anything else is not a valid report id anyway.
 */
function pathParam(req: Request, name: string): string {
  const value: unknown = req.params[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}

export function createAdminRouter(deps: AdminRoutesDeps): Router {
  const router = Router();

  // Unauthenticated by design: this is the login exchange itself.
  router.post(
    '/session',
    asyncHandler(async (req, res) => {
      if (deps.config.adminToken === '') {
        throw fail.forbidden(
          'The admin console is not configured on this deployment (ADMIN_TOKEN is unset).',
        );
      }
      const body = (req.body ?? {}) as { token?: unknown };
      const candidate = typeof body.token === 'string' ? body.token.trim() : '';
      if (!adminTokenMatches(deps.config.adminToken, candidate)) {
        throw fail.unauthorized('That admin token is not valid.');
      }
      const session = issueAdminSession(deps.config);
      // The console never sees this token in JavaScript: it arrives as an
      // httpOnly cookie. The body still carries it for scripts and CI.
      setSessionCookie(req, res, session);
      sendItem(res, { token: session.token, expiresAt: session.expiresAt }, 201);
    }),
  );

  /**
   * "Am I signed in?" — the question the console asks on load and after login.
   *
   * Registered BEFORE `requireAdmin` because its whole purpose is to answer for
   * an anonymous visitor, and it must answer 200 either way. The shape is a bare
   * `{ ok, authenticated }`, not the `{ item }` envelope: the console reads
   * `res.authenticated` directly, and wrapping it is how this endpoint would
   * silently report "signed out" forever.
   */
  router.get('/session', (req, res) => {
    res.status(200).json({
      ok: true,
      authenticated: deps.config.adminToken !== '' && isAdminRequest(deps.config, req),
    });
  });

  /** Sign-out. Idempotent, and deliberately outside `requireAdmin`: clearing a
   *  cookie must work even when the session it names has already expired. */
  router.delete('/session', (req, res) => {
    clearSessionCookie(req, res);
    sendOk(res);
  });

  router.use(requireAdmin(deps.config));

  router.get(
    '/reports',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = listReportsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw fail.validationFailed('Those list filters are not valid.', zodIssues(parsed.error));
      }

      const result = await listReports(parsed.data);
      sendList(
        res,
        result.items.map(toReport),
        result.total,
        result.limit,
        result.offset,
      );
    }),
  );

  router.post(
    '/reports',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = createReportSchema.safeParse(req.body);
      if (!parsed.success) {
        throw fail.validationFailed(
          'The report was not accepted as submitted.',
          zodIssues(parsed.error),
        );
      }

      const doc = await createReport(parsed.data, {
        registry: deps.registry,
        source: 'console',
      });
      sendItem(res, toReport(doc), 201);
    }),
  );

  router.get(
    '/reports/:id',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const id = pathParam(req, 'id');
      const doc = await findReportById(id);
      if (!doc) throw fail.notFound(`No report with id "${id}".`);

      sendItem(res, toReport(doc));
    }),
  );

  router.patch(
    '/reports/:id',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = updateReportSchema.safeParse(req.body);
      if (!parsed.success) {
        throw fail.validationFailed('That update is not valid.', zodIssues(parsed.error));
      }

      const id = pathParam(req, 'id');
      const { doc } = await updateReport(id, parsed.data);
      sendItem(res, toReport(doc));
    }),
  );

  router.delete(
    '/reports/:id',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const id = pathParam(req, 'id');
      await deleteReport(id);
      sendOk(res);
    }),
  );

  router.get(
    '/stats',
    asyncHandler(async (_req, res) => {
      assertDatabaseConnected();
      const [reports, appointments] = await Promise.all([
        computeReportStats(),
        computeAppointmentStats(),
      ]);
      // Enveloped like every other single-object response in this API. It used to
      // return a bare object, which broke its own consumer: the console reads
      // `res.item`, so the dashboard's report tiles rendered nothing at all.
      sendItem(res, { ...reports, appointments });
    }),
  );

  /* ── appointments ─────────────────────────────────────────────────────── */

  router.post(
    '/appointments',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = createAppointmentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw fail.validationFailed(
          'The appointment request was not accepted as submitted.',
          zodIssues(parsed.error),
        );
      }

      const doc = await createAppointment(parsed.data, {
        registry: deps.registry,
        source: 'console',
      });
      sendItem(res, toAppointment(doc), 201);
    }),
  );

  router.get(
    '/appointments',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = listAppointmentsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw fail.validationFailed('Those list filters are not valid.', zodIssues(parsed.error));
      }

      const result = await listAppointments(parsed.data);
      sendList(res, result.items.map(toAppointment), result.total, result.limit, result.offset);
    }),
  );

  /**
   * Registered BEFORE `/appointments/:id`. Otherwise "stats" is matched as an id,
   * fails the ObjectId test and answers a misleading 404.
   */
  router.get(
    '/appointments/stats',
    asyncHandler(async (_req, res) => {
      assertDatabaseConnected();
      sendItem(res, await computeAppointmentStats());
    }),
  );

  router.get(
    '/appointments/:id',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const id = pathParam(req, 'id');
      const doc = await findAppointmentById(id);
      if (!doc) throw fail.notFound(`No appointment with id "${id}".`);

      sendItem(res, toAppointment(doc));
    }),
  );

  router.patch(
    '/appointments/:id',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const parsed = updateAppointmentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw fail.validationFailed('That update is not valid.', zodIssues(parsed.error));
      }

      const id = pathParam(req, 'id');
      const { doc } = await updateAppointment(id, parsed.data);
      sendItem(res, toAppointment(doc));
    }),
  );

  router.delete(
    '/appointments/:id',
    asyncHandler(async (req, res) => {
      assertDatabaseConnected();

      const id = pathParam(req, 'id');
      await deleteAppointment(id);
      sendOk(res);
    }),
  );

  return router;
}

/** Liveness/readiness probe for the API and the database it depends on. */
import { Router } from 'express';
import { LABO } from '@betterlabo/shared';
import { getDefaultRegistry } from '../barangays.js';
import { isDatabaseConnected } from '../db.js';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const registry = getDefaultRegistry();
    res.json({
      ok: true,
      service: '@betterlabo/api',
      time: new Date().toISOString(),
      database: isDatabaseConnected() ? 'connected' : 'disconnected',
      municipality: {
        name: LABO.name,
        officialName: LABO.officialName,
        psgcCode: LABO.psgcCode,
        expectedBarangays: LABO.barangayCount,
      },
      barangayIndex: {
        loaded: registry.size > 0,
        count: registry.size,
      },
    });
  });

  return router;
}

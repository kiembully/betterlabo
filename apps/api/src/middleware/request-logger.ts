/**
 * One debug line per finished request.
 *
 * Method, path, status and duration only — never the query string or a body,
 * because both can carry a reporter's contact details.
 */
import type { RequestHandler } from 'express';
import { log } from '../logger.js';

export function requestLogger(): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      log.debug('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(elapsedMs * 10) / 10,
      });
    });
    next();
  };
}

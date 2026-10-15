/**
 * `asyncHandler` for the route layer.
 *
 * Express 5 already forwards a rejected promise to the error middleware, but
 * wrapping makes the intent explicit at every call site and keeps the behaviour
 * identical for a synchronous throw.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

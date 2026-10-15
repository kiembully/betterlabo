/** Small shared helpers for validating request input. */

/** The subset of a zod issue this API puts on the wire. */
export interface ZodIssueLike {
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly code: string;
}

export interface ZodErrorLike {
  readonly issues: readonly ZodIssueLike[];
}

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

/**
 * Flattens zod's issue list into something a form can highlight. Field names,
 * not values — a validation payload is echoed to the browser, so it must never
 * repeat the submitted content back.
 */
export function zodIssues(error: ZodErrorLike): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

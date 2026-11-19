// What our code reads from a caught error (F1, W20). `catch (err: any)` let
// every block read anything; catching `unknown` and taking this typed view
// keeps the same behaviour while TypeScript checks each field that is used.
// The fields are the ones thrown in this codebase: Error (message, name,
// stack), our `{ http }` status errors, Postgres errors (code, detail,
// constraint) and HTTP client errors (status, statusCode, response).

export interface CaughtError {
  message?: string;
  name?: string;
  stack?: string;
  /** Our own "answer with this status" marker: Object.assign(new Error(..), { http: 409 }). */
  http?: number;
  /** Postgres SQLSTATE, Node system error code, … */
  code?: string;
  detail?: string;
  constraint?: string;
  status?: number;
  statusCode?: number;
  response?: { status?: number; data?: unknown };
  /** Anything else a specific library adds. */
  [key: string]: unknown;
}

/** The same thrown object, typed for reading (a thrown string becomes { message }). */
export function asCaughtError(caught: unknown): CaughtError {
  if (caught && typeof caught === 'object') return caught as CaughtError;
  return { message: caught === undefined || caught === null ? undefined : String(caught) };
}

/** A human message for logs / responses. */
export function caughtMessage(caught: unknown, fallback = 'Unexpected error'): string {
  const m = asCaughtError(caught).message;
  return typeof m === 'string' && m ? m : fallback;
}

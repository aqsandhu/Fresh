// What our screens read from a caught error (F1, W20). `catch (e: any)` let
// every block read anything; catching `unknown` and taking this typed view
// keeps the same behaviour while TypeScript checks each field that is used.
// Fields: Error (message, name), axios / fetch errors (status, code,
// response.status, response.data.message) and our own markers.

export interface CaughtError {
  message?: string;
  name?: string;
  code?: string;
  status?: number;
  response?: {
    status?: number;
    data?: { message?: string; error?: string; errors?: unknown; [key: string]: unknown };
  };
  /** Anything else a specific library adds. */
  [key: string]: unknown;
}

/** The same thrown object, typed for reading (a thrown string becomes { message }). */
export function asCaughtError(caught: unknown): CaughtError {
  if (caught && typeof caught === "object") return caught as CaughtError;
  return { message: caught === undefined || caught === null ? undefined : String(caught) };
}

/** The server's message, else the error's own, else the fallback. */
export function caughtMessage(caught: unknown, fallback = "Something went wrong"): string {
  const e = asCaughtError(caught);
  const m = e.response?.data?.message ?? e.message;
  return typeof m === "string" && m ? m : fallback;
}

/**
 * Reads fields off whatever was thrown exactly like `e?.field` did (nothing is
 * converted — a thrown string still has no `.message`), but typed.
 */
export function errorView(caught: unknown): CaughtError | undefined {
  return caught === null || caught === undefined ? undefined : (caught as CaughtError);
}

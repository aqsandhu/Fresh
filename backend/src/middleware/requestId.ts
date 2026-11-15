// ============================================================================
// REQUEST ID — one id per request, on the response and in every log line.
//
// When a customer or an admin reports "it failed at 3:42", the id on the error
// response (header X-Request-Id, and `requestId` in an error body) finds the
// exact log lines for that request — across the access log, the error log and
// the error-monitoring event. An id sent by a trusted proxy / client is reused
// when it looks like an id (so one id can follow a request across services);
// anything else is replaced, so a caller cannot write junk into the logs.
// ============================================================================

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation id for this request (also sent back as X-Request-Id). */
    requestId?: string;
  }
}

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  const id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export default requestId;

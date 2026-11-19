/**
 * Owner's decision J1: an entry that needs a second admin (waste, refund,
 * payment, discount, salary raise…) and was sent without an approval code
 * is not refused — it waits for the city admin (HTTP 202, `data.queued`).
 *
 * The API client turns that answer into this "error" so a form never shows
 * "Saved" for something that has not happened yet: forms check isQueued()
 * in onError, close, and the user sees a green "sent for approval" toast.
 */
export class QueuedForApproval extends Error {
  readonly queued = true;
  constructor(message: string, readonly requestId: string | null) {
    super(message);
    this.name = 'QueuedForApproval';
  }
}

export const isQueued = (e: unknown): e is QueuedForApproval =>
  Boolean(e && typeof e === 'object' && (e as { queued?: unknown }).queued === true);

/** A 202 answer that says the entry is waiting for approval → the queued "error"; else null. */
export function queuedFromResponse(status: number, body: unknown): QueuedForApproval | null {
  const b = body as { message?: string; data?: { queued?: boolean; requestId?: string; request_id?: string } } | null;
  if (status !== 202 || !b?.data?.queued) return null;
  return new QueuedForApproval(b.message || 'Sent to the city admin for approval.', b.data.requestId ?? b.data.request_id ?? null);
}

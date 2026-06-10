/** In-memory per-socket event rate limiting (works per server instance). */
export class SocketEventRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxEvents: number,
    private readonly windowMs: number
  ) {}

  allow(socketId: string, eventKey: string): boolean {
    const key = `${socketId}:${eventKey}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this.hits.get(key) || []).filter((t) => t > windowStart);

    if (timestamps.length >= this.maxEvents) {
      this.hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  cleanup(socketId: string): void {
    for (const key of this.hits.keys()) {
      if (key.startsWith(`${socketId}:`)) {
        this.hits.delete(key);
      }
    }
  }
}

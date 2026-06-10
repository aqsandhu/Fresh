import type { SessionHandlers } from './types';

let handlers: SessionHandlers | null = null;

export function registerSessionHandlers(next: SessionHandlers): void {
  handlers = next;
}

export function clearAppSession(): void {
  handlers?.onClear();
}

export function notifyTokenRefreshed(token: string): void {
  handlers?.onTokenUpdate(token);
}

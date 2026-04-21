/**
 * Fresh Bazar Website - Structured Logger Utility
 * Logs to console in development, sends to backend in production.
 * Includes user context, timestamps, and error stack traces.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  phone?: string;
  page?: string;
  action?: string;
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  service: string;
  version: string;
}

const LOG_VERSION = '1.0.0';
const SERVICE_NAME = 'freshbazar-website';
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 30000;

// Detect development mode
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

class Logger {
  private queue: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;

  constructor() {
    // Only initialize on client side
    if (typeof window !== 'undefined') {
      this.isInitialized = true;
      if (!IS_DEVELOPMENT) {
        this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
      }
    }
  }

  private createEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined,
      service: SERVICE_NAME,
      version: LOG_VERSION,
    };
  }

  private async sendToBackend(entries: LogEntry[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ logs: entries }),
      });
      if (!response.ok) {
        console.warn('[Logger] Failed to send logs to backend:', response.status);
      }
    } catch {
      console.warn('[Logger] Could not reach backend logging endpoint');
    }
  }

  private enqueue(entry: LogEntry): void {
    if (!this.isInitialized) return;
    this.queue.push(entry);
    if (IS_DEVELOPMENT) {
      this.printToConsole(entry);
    }
    if (this.queue.length >= BATCH_SIZE) this.flush();
  }

  private printToConsole(entry: LogEntry): void {
    const prefix = `[Fresh Bazar Website ${entry.level.toUpperCase()}]`;
    const args = [prefix, entry.message, { timestamp: entry.timestamp, context: entry.context, error: entry.error }];
    switch (entry.level) {
      case 'debug': console.debug(...args); break;
      case 'info': console.info(...args); break;
      case 'warn': console.warn(...args); break;
      case 'error': console.error(...args); break;
    }
  }

  public flush(): void {
    if (this.queue.length === 0 || !this.isInitialized) return;
    const batch = [...this.queue];
    this.queue = [];
    if (IS_DEVELOPMENT) return;
    this.sendToBackend(batch);
  }

  public debug(message: string, context?: LogContext): void {
    this.enqueue(this.createEntry('debug', message, context));
  }
  public info(message: string, context?: LogContext): void {
    this.enqueue(this.createEntry('info', message, context));
  }
  public warn(message: string, context?: LogContext): void {
    this.enqueue(this.createEntry('warn', message, context));
  }
  public error(message: string, error?: Error, context?: LogContext): void {
    this.enqueue(this.createEntry('error', message, context, error));
  }
  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// Singleton instance (safe for SSR - only initializes on client)
export const logger = new Logger();
export default logger;

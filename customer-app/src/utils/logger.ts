/**
 * Fresh Bazar Customer App - Structured Logger Utility
 * Logs to console in development, sends to backend in production.
 * Includes user context, timestamps, and error stack traces.
 */

import { API_BASE_URL, IS_DEVELOPMENT } from './constants';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  phone?: string;
  screen?: string;
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
const SERVICE_NAME = 'freshbazar-customer-app';
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 30000;

class Logger {
  private queue: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic flush in production
    if (!IS_DEVELOPMENT) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  private createEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
      service: SERVICE_NAME,
      version: LOG_VERSION,
    };
  }

  private async sendToBackend(entries: LogEntry[]): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs: entries }),
      });
      if (!response.ok) {
        console.warn('[Logger] Failed to send logs to backend:', response.status);
      }
    } catch (e) {
      // Silently fail - don't cause infinite loops
      console.warn('[Logger] Could not reach backend logging endpoint');
    }
  }

  private enqueue(entry: LogEntry): void {
    this.queue.push(entry);

    // In development, log immediately to console
    if (IS_DEVELOPMENT) {
      this.printToConsole(entry);
    }

    // Flush if batch is full
    if (this.queue.length >= BATCH_SIZE) {
      this.flush();
    }
  }

  private printToConsole(entry: LogEntry): void {
    const prefix = `[Fresh Bazar ${entry.level.toUpperCase()}]`;
    const meta = {
      timestamp: entry.timestamp,
      context: entry.context,
      ...(entry.error ? { error: entry.error } : {}),
    };

    switch (entry.level) {
      case 'debug':
        console.debug(prefix, entry.message, meta);
        break;
      case 'info':
        console.info(prefix, entry.message, meta);
        break;
      case 'warn':
        console.warn(prefix, entry.message, meta);
        break;
      case 'error':
        console.error(prefix, entry.message, meta);
        break;
    }
  }

  public flush(): void {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    if (IS_DEVELOPMENT) {
      // Already printed to console in enqueue
      return;
    }

    // In production, send to backend
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

  /**
   * Flush any remaining logs before app shutdown
   */
  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}

// Singleton instance
export const logger = new Logger();

export default logger;

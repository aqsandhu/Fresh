/**
 * Fresh Bazar Rider App - Structured Logger Utility
 * Logs locally (console). Remote shipping is disabled — the backend has no
 * /logs route.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  riderId?: string;
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
const SERVICE_NAME = 'freshbazar-rider-app';
const BATCH_SIZE = 10;

class Logger {
  private queue: LogEntry[] = [];

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

  private enqueue(entry: LogEntry): void {
    this.printToConsole(entry);
    this.queue.push(entry);
    if (this.queue.length >= BATCH_SIZE) this.flush();
  }

  private printToConsole(entry: LogEntry): void {
    const prefix = `[Fresh Bazar Rider ${entry.level.toUpperCase()}]`;
    const args = [prefix, entry.message, { timestamp: entry.timestamp, context: entry.context, error: entry.error }];
    switch (entry.level) {
      case 'debug': console.debug(...args); break;
      case 'info': console.info(...args); break;
      case 'warn': console.warn(...args); break;
      case 'error': console.error(...args); break;
    }
  }

  public flush(): void {
    // Local logging only — drop the buffered entries.
    this.queue = [];
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
    this.flush();
  }
}

export const logger = new Logger();
export default logger;

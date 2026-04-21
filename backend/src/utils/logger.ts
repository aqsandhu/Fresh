// ============================================================================
// WINSTON LOGGER CONFIGURATION
// ============================================================================

import winston from 'winston';
import path from 'path';

// Log level from environment
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE = process.env.LOG_FILE || 'logs/app.log';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create logs directory if it doesn't exist
const logsDir = path.dirname(LOG_FILE);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Create transports array
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// Add file transport in production
if (NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: LOG_FILE,
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: 'freshbazar-api' },
  transports,
  // Don't exit on error
  exitOnError: false,
});

// Stream for Morgan HTTP logging
export const morganStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

export default logger;

/**
 * Logger - Winston-based structured logging with file rotation
 *
 * Features:
 * - Three log files: all.log, debug.log, error.log
 * - Daily rotation with configurable retention
 * - Colorized console output for development
 * - Child loggers with component prefixes
 * - Structured metadata support
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  component?: string;
  agentId?: string;
  serviceName?: string;
  [key: string]: unknown;
}

export interface LoggerConfig {
  logDir: string;
  consoleLevel: LogLevel;
  fileLevel: LogLevel;
  maxSize: string;
  maxFiles: string;
  jsonFormat: boolean;
}

export interface ILogger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  child(component: string): ILogger;
  flush(): Promise<void>;
}

// ============================================================================
// Configuration
// ============================================================================

function getConfig(): LoggerConfig {
  return {
    logDir: process.env.LOG_DIR || 'logs',
    consoleLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
    fileLevel: (process.env.LOG_FILE_LEVEL as LogLevel) || 'debug',
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    jsonFormat: process.env.LOG_JSON_FORMAT === 'true',
  };
}

// ============================================================================
// Formats
// ============================================================================

/**
 * Console format: colorized, human-readable
 * Example: 2025-12-26 10:30:45 info [MCP]: Server started on port 3005
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { level, message, timestamp, component, agentId, serviceName, ...rest } = info;
    let line = `${timestamp} ${level}`;
    if (component) line += ` [${component}]`;
    if (agentId) line += ` [agent:${agentId}]`;
    if (serviceName) line += ` [service:${serviceName}]`;
    line += `: ${message}`;

    // Add extra metadata if present
    const extraKeys = Object.keys(rest).filter(
      (k) => !['level', 'message', 'timestamp', 'splat'].includes(k)
    );
    if (extraKeys.length > 0) {
      const extra: Record<string, unknown> = {};
      for (const k of extraKeys) {
        extra[k] = rest[k];
      }
      line += ` ${JSON.stringify(extra)}`;
    }
    return line;
  })
);

/**
 * File format: structured, parseable
 * Example: 2025-12-26T10:30:45.123Z INFO [MCP] Server started on port 3005
 */
function createFileFormat(jsonFormat: boolean) {
  if (jsonFormat) {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );
  }

  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const { level, message, timestamp, component, agentId, serviceName, ...rest } = info;
      const parts = [timestamp, level.toUpperCase()];
      if (component) parts.push(`[${component}]`);
      if (agentId) parts.push(`[agent:${agentId}]`);
      if (serviceName) parts.push(`[service:${serviceName}]`);
      parts.push(message);

      // Add extra metadata if present
      const extraKeys = Object.keys(rest).filter(
        (k) => !['level', 'message', 'timestamp', 'splat'].includes(k)
      );
      if (extraKeys.length > 0) {
        const extra: Record<string, unknown> = {};
        for (const k of extraKeys) {
          extra[k] = rest[k];
        }
        parts.push(JSON.stringify(extra));
      }
      return parts.join(' ');
    })
  );
}

// ============================================================================
// Transports
// ============================================================================

function createTransports(config: LoggerConfig): winston.transport[] {
  const transports: winston.transport[] = [];
  const fileFormat = createFileFormat(config.jsonFormat);

  // Console transport (always enabled)
  transports.push(
    new winston.transports.Console({
      level: config.consoleLevel,
      format: consoleFormat,
    })
  );

  // File transports (if logDir is configured)
  if (config.logDir) {
    // 1. all.log - All log levels
    transports.push(
      new DailyRotateFile({
        dirname: config.logDir,
        filename: 'all-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: config.fileLevel,
        maxSize: config.maxSize,
        maxFiles: config.maxFiles,
        format: fileFormat,
      })
    );

    // 2. debug.log - Debug level only (filtered)
    transports.push(
      new DailyRotateFile({
        dirname: config.logDir,
        filename: 'debug-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'debug',
        maxSize: config.maxSize,
        maxFiles: config.maxFiles,
        format: winston.format.combine(
          winston.format((info) => (info.level === 'debug' ? info : false))(),
          fileFormat
        ),
      })
    );

    // 3. error.log - Error and warn levels only
    transports.push(
      new DailyRotateFile({
        dirname: config.logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'warn', // Captures warn and error
        maxSize: config.maxSize,
        maxFiles: config.maxFiles,
        format: fileFormat,
      })
    );
  }

  return transports;
}

// ============================================================================
// Logger Implementation
// ============================================================================

class WinstonLogger implements ILogger {
  private winstonLogger: winston.Logger;
  private defaultMeta: LogMeta;

  constructor(winstonLogger: winston.Logger, defaultMeta: LogMeta = {}) {
    this.winstonLogger = winstonLogger;
    this.defaultMeta = defaultMeta;
  }

  private log(level: LogLevel, message: string, meta?: LogMeta): void {
    this.winstonLogger.log(level, message, { ...this.defaultMeta, ...meta });
  }

  debug(message: string, meta?: LogMeta): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.log('error', message, meta);
  }

  /**
   * Create a child logger with preset component name.
   * Usage: const log = logger.child('MCP');
   *        log.info('Server started'); // [MCP]: Server started
   */
  child(component: string): ILogger {
    return new WinstonLogger(this.winstonLogger, {
      ...this.defaultMeta,
      component,
    });
  }

  /**
   * Flush all log transports (for graceful shutdown).
   * Call this before process exit to ensure all logs are written.
   */
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      // Give transports time to finish writing
      const timeout = setTimeout(() => resolve(), 1000);
      this.winstonLogger.on('finish', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.winstonLogger.end();
    });
  }
}

// ============================================================================
// Fallback Logger (pre-initialization)
// ============================================================================

function formatFallback(level: string, message: string, meta?: LogMeta): string {
  const parts = [new Date().toISOString(), level.toUpperCase()];
  if (meta?.component) parts.push(`[${meta.component}]`);
  parts.push(message);
  return parts.join(' ');
}

class FallbackLogger implements ILogger {
  private defaultMeta: LogMeta;

  constructor(defaultMeta: LogMeta = {}) {
    this.defaultMeta = defaultMeta;
  }

  debug(message: string, meta?: LogMeta): void {
    console.debug(formatFallback('debug', message, { ...this.defaultMeta, ...meta }));
  }

  info(message: string, meta?: LogMeta): void {
    console.info(formatFallback('info', message, { ...this.defaultMeta, ...meta }));
  }

  warn(message: string, meta?: LogMeta): void {
    console.warn(formatFallback('warn', message, { ...this.defaultMeta, ...meta }));
  }

  error(message: string, meta?: LogMeta): void {
    console.error(formatFallback('error', message, { ...this.defaultMeta, ...meta }));
  }

  child(component: string): ILogger {
    return new FallbackLogger({ ...this.defaultMeta, component });
  }

  async flush(): Promise<void> {
    // Nothing to flush for console
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let loggerInstance: WinstonLogger | null = null;
let isInitialized = false;

/**
 * Initialize the logger singleton. Must be called early in startup.
 * Creates the log directory if it doesn't exist.
 */
export async function initializeLogger(configOverrides?: Partial<LoggerConfig>): Promise<ILogger> {
  if (loggerInstance) {
    return loggerInstance;
  }

  const config = { ...getConfig(), ...configOverrides };

  // Ensure log directory exists
  if (config.logDir) {
    const absoluteLogDir = path.isAbsolute(config.logDir)
      ? config.logDir
      : path.join(process.cwd(), config.logDir);

    if (!existsSync(absoluteLogDir)) {
      await mkdir(absoluteLogDir, { recursive: true });
    }
  }

  const winstonLogger = winston.createLogger({
    level: 'debug', // Set to lowest; transports filter individually
    transports: createTransports(config),
    exitOnError: false,
  });

  loggerInstance = new WinstonLogger(winstonLogger);
  isInitialized = true;

  return loggerInstance;
}

/**
 * Get the logger singleton.
 * Returns a fallback console logger if not yet initialized.
 */
export function getLogger(): ILogger {
  if (!loggerInstance) {
    // Fallback to console logger if not initialized
    // This allows importing logger before initialization completes
    return new FallbackLogger();
  }
  return loggerInstance;
}

/**
 * Check if the logger has been initialized.
 */
export function isLoggerInitialized(): boolean {
  return isInitialized;
}

/**
 * Create a child logger for a specific component.
 * Usage: const log = createComponentLogger('MCP');
 */
export function createComponentLogger(component: string): ILogger {
  return getLogger().child(component);
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Default logger instance.
 * Uses a proxy to allow importing before initialization.
 * After initializeLogger() is called, this will use the Winston logger.
 */
export const logger: ILogger = {
  debug: (message: string, meta?: LogMeta) => getLogger().debug(message, meta),
  info: (message: string, meta?: LogMeta) => getLogger().info(message, meta),
  warn: (message: string, meta?: LogMeta) => getLogger().warn(message, meta),
  error: (message: string, meta?: LogMeta) => getLogger().error(message, meta),
  child: (component: string) => getLogger().child(component),
  flush: () => getLogger().flush(),
};

/**
 * @deprecated Use createComponentLogger instead
 */
export function createLogger(level?: LogLevel, filePath?: string): ILogger {
  // Backwards compatibility: ignore parameters, return child logger
  return getLogger();
}

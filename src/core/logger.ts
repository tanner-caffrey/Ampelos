/**
 * Logger - simple structured logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  agentId?: string;
  serviceName?: string;
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel = 'info';
  private logToFile: boolean = false;
  private filePath?: string;

  constructor(level: LogLevel = 'info', filePath?: string) {
    this.level = level;
    if (filePath) {
      this.logToFile = true;
      this.filePath = filePath;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private formatMessage(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.message,
    ];

    if (entry.agentId) {
      parts.push(`[agent:${entry.agentId}]`);
    }

    if (entry.serviceName) {
      parts.push(`[service:${entry.serviceName}]`);
    }

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    const formatted = this.formatMessage(entry);

    // Console output
    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }

    // File output (if enabled)
    if (this.logToFile && this.filePath) {
      // In a production system, you'd use a proper file logging library
      // For now, we'll just log to console
      // TODO: Implement file logging
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Default logger instance
export const logger = new Logger('info');

// Create logger factory
export function createLogger(level: LogLevel = 'info', filePath?: string): Logger {
  return new Logger(level, filePath);
}


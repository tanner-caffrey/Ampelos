/**
 * Custom error types for Ampelos
 */

/**
 * Base error class for Ampelos errors
 */
export class AmpelosError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Service-related errors
 */
export class ServiceError extends AmpelosError {
  constructor(message: string, public readonly serviceName?: string, public readonly agentId?: string) {
    super(message, 'SERVICE_ERROR');
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends AmpelosError {
  constructor(message: string, public readonly configPath?: string) {
    super(message, 'CONFIG_ERROR');
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AmpelosError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
  }
}


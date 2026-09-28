import { randomUUID } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  provider?: string;
  jobKey?: string;
  [key: string]: unknown;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  service: string;
}

class Logger {
  private service: string;
  private defaultContext: LogContext = {};
  private minLevel: LogLevel;

  constructor(service: string, minLevel: LogLevel = 'info') {
    this.service = service;
    this.minLevel = minLevel;
  }

  setDefaultContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  child(context: LogContext): Logger {
    const child = new Logger(this.service, this.minLevel);
    child.defaultContext = { ...this.defaultContext, ...context };
    return child;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, context: LogContext): StructuredLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.defaultContext, ...context },
      service: this.service,
    };
  }

  private output(entry: StructuredLogEntry): void {
    const line = JSON.stringify(entry);
    if (entry.level === 'error' || entry.level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string, context: LogContext = {}): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatEntry('debug', message, context));
    }
  }

  info(message: string, context: LogContext = {}): void {
    if (this.shouldLog('info')) {
      this.output(this.formatEntry('info', message, context));
    }
  }

  warn(message: string, context: LogContext = {}): void {
    if (this.shouldLog('warn')) {
      this.output(this.formatEntry('warn', message, context));
    }
  }

  error(message: string, context: LogContext = {}): void {
    if (this.shouldLog('error')) {
      this.output(this.formatEntry('error', message, context));
    }
  }

  withCorrelationId(correlationId: string): Logger {
    return this.child({ correlationId });
  }
}

export function createLogger(service: string, minLevel?: LogLevel): Logger {
  return new Logger(service, minLevel);
}

export function generateCorrelationId(): string {
  return randomUUID().split('-')[0];
}

export const discoveryLogger = createLogger('discovery');
export const schedulerLogger = createLogger('scheduler');
export const healthLogger = createLogger('health');
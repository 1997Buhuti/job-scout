export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogPayload {
  message?: string;
  data?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

type LogEntry = LogPayload & {
  level: LogLevel;
  service: string;
  requestId: string;
  timestamp: string;
};

/**
 * Structured JSON logger for CloudWatch (one JSON object per line).
 */
export class Logger {
  constructor(
    private readonly serviceName: string,
    private readonly requestId = '',
  ) {}

  child(serviceName: string): Logger {
    return new Logger(serviceName, this.requestId);
  }

  debug(payload: LogPayload): void {
    this.write('DEBUG', payload);
  }

  info(payload: LogPayload): void {
    this.write('INFO', payload);
  }

  warn(payload: LogPayload): void {
    this.write('WARNING', payload, 'warn');
  }

  error(err: unknown, message?: string): void {
    const normalized = normalizeError(err);
    this.write(
      'CRITICAL',
      {
        message: message ?? normalized.message,
        error: {
          name: normalized.name,
          message: normalized.message,
          stack: normalized.stack,
        },
      },
      'error',
    );
  }

  private write(level: LogLevel, payload: LogPayload, stream: 'log' | 'warn' | 'error' = 'log'): void {
    const entry: LogEntry = {
      level,
      service: this.serviceName,
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    const line = JSON.stringify(entry);
    if (stream === 'error') {
      console.error(line);
      return;
    }
    if (stream === 'warn') {
      console.warn(line);
      return;
    }
    console.log(line);
  }
}

const normalizeError = (err: unknown): Error => {
  if (err instanceof Error) {
    return err;
  }
  if (typeof err === 'string') {
    return new Error(err);
  }
  return new Error('Unknown error', { cause: err });
};

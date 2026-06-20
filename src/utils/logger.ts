import { LogMetadata } from '../types';

export class StructuredLogger {
  constructor(private reqId: string) {}

  info(msg: string, metadata: Record<string, unknown> = {}): void {
    this.log('INFO', msg, metadata);
  }

  warn(msg: string, metadata: Record<string, unknown> = {}): void {
    this.log('WARN', msg, metadata);
  }

  error(msg: string, metadata: Record<string, unknown> = {}): void {
    this.log('ERROR', msg, metadata);
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, metadata: Record<string, unknown>): void {
    const payload: LogMetadata = {
      timestamp: new Date().toISOString(),
      level,
      reqId: this.reqId,
      msg,
      ...metadata,
    };
    
    // Output standard console out as stringified JSON which Vercel parses into structured logs.
    console.log(JSON.stringify(payload));
  }
}
export interface LogMetadata {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  reqId: string;
  msg: string;
  [key: string]: unknown;
}

export interface ProxyErrorPayload {
  error: {
    code: string;
    message: string;
    statusCode: number;
  };
}
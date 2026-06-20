import { StructuredLogger } from './logger';

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleRouteError(
  error: unknown,
  logger: StructuredLogger,
  origin: string | null,
  durationMs: number
): Response {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred while proxying your request';

  if (error instanceof AppError) {
    status = error.statusCode;
    code = error.code !== 'INTERNAL_ERROR' ? error.code : getCodeFromStatus(status);
    message = error.message;
  } else if (error instanceof Error) {
    if (error.name === 'AbortError') {
      status = 504;
      code = 'GATEWAY_TIMEOUT';
      message = 'The upstream API did not respond within the maximum timeout (30s) or client disconnected';
    } else {
      message = error.message;
      code = 'UPSTREAM_ERROR';
      status = 502; // Bad Gateway
    }
  }

  logger.error('Proxy request failed', {
    status,
    code,
    message,
    durationMs,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error),
  });

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  // Inject valid CORS headers on errors so browsers do not hide error payloads
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || '*';
  if (allowedOriginsEnv === '*') {
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        statusCode: status,
      }
    }),
    {
      status,
      headers,
    }
  );
}

function getCodeFromStatus(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 413: return 'PAYLOAD_TOO_LARGE';
    default: return 'INTERNAL_ERROR';
  }
}
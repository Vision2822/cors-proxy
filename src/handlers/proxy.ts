import { validateRequest } from '../middlewares/auth';
import { handleCorsPreflight, getCorsHeaders } from '../middlewares/cors';
import { StructuredLogger } from '../utils/logger';
import { AppError, handleRouteError } from '../utils/errors';
import { Agent, setGlobalDispatcher } from 'undici';

// Initialize global undici Agent with connection pooling optimization
const globalAgent = new Agent({
  keepAliveTimeout: 15000,   // Keep socket open for 15s of inactivity
  keepAliveMaxTimeout: 90000,
  connections: 1000,         // High concurrent pooling
  pipelining: 1,             // Optimized standard throughput per connection
});
setGlobalDispatcher(globalAgent);

export async function handleProxy(request: Request): Promise<Response> {
  const startTime = Date.now();
  const reqId = crypto.randomUUID();
  const logger = new StructuredLogger(reqId);

  try {
    const urlObj = new URL(request.url);
    const method = request.method;
    const origin = request.headers.get('origin');

    // Intercept CORS preflight requests
    if (method === 'OPTIONS') {
      return handleCorsPreflight(request);
    }

    // Parse and validate the target URL parameter
    const targetUrlString = urlObj.searchParams.get('url');
    if (!targetUrlString) {
      throw new AppError('Missing "url" query parameter specifying target URL', 400);
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(targetUrlString);
    } catch {
      throw new AppError('Invalid "url" query parameter. Must be an absolute HTTP/HTTPS URL', 400);
    }

    // Security & Auth Middlewares
    validateRequest(request, origin);

    // Validate size within Vercel's physical limit of 4.5 MB
    const contentLengthStr = request.headers.get('content-length');
    if (contentLengthStr) {
      const contentLength = parseInt(contentLengthStr, 10);
      if (contentLength > 4.5 * 1024 * 1024) {
        throw new AppError('Payload Too Large. Vercel limits payloads to 4.5 MB', 413);
      }
    }

    // Prepare downstream headers
    const targetHeaders = new Headers();
    const headersToSkip = new Set([
      'host',
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
      'x-proxy-api-key',
    ]);

    for (const [key, value] of request.headers.entries()) {
      if (!headersToSkip.has(key.toLowerCase())) {
        targetHeaders.set(key, value);
      }
    }

    // Ensure clean host context
    targetHeaders.set('host', targetUrl.host);
    targetHeaders.set('x-request-id', reqId);

    // Strict 30s connection timeout and client disconnect propagation
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort();
    }, 30000);

    const combinedSignal = AbortSignal.any([
      request.signal,
      timeoutController.signal,
    ]);

    logger.info('Forwarding request to target', {
      method,
      target: targetUrl.href,
      contentLength: contentLengthStr ?? 'unknown',
    });

    const isGetOrHead = ['GET', 'HEAD'].includes(method);
    const fetchOptions: RequestInit = {
      method,
      headers: targetHeaders,
      body: isGetOrHead ? null : request.body,
      duplex: isGetOrHead ? undefined : 'half', // Required for body streaming in node environment
      signal: combinedSignal,
    };

    const upstreamResponse = await fetch(targetUrl.href, fetchOptions);
    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;
    logger.info('Upstream response received', {
      status: upstreamResponse.status,
      durationMs,
    });

    // Clean up response headers returned from target
    const finalHeaders = getCorsHeaders(origin);
    const skippedUpstreamHeaders = new Set([
      'connection',
      'keep-alive',
      'transfer-encoding',
      'content-encoding',
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'access-control-allow-methods',
      'access-control-allow-headers',
      'access-control-expose-headers',
    ]);

    for (const [key, value] of upstreamResponse.headers.entries()) {
      if (!skippedUpstreamHeaders.has(key.toLowerCase())) {
        finalHeaders.set(key, value);
      }
    }

    // Direct stream forwarding minimizes memory footprint
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: finalHeaders,
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    return handleRouteError(error, logger, request.headers.get('origin'), durationMs);
  }
}
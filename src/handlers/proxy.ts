import { validateRequest } from '../middlewares/auth.js';
import { handleCorsPreflight, getCorsHeaders } from '../middlewares/cors.js';
import { StructuredLogger } from '../utils/logger.js';
import { AppError, handleRouteError } from '../utils/errors.js';
import { Agent, setGlobalDispatcher } from 'undici';

// Initialize global undici Agent with connection pooling optimization
const globalAgent = new Agent({
  keepAliveTimeout: 15000,
  keepAliveMaxTimeout: 90000,
  connections: 1000,
  pipelining: 1,
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

    if (method === 'OPTIONS') {
      return handleCorsPreflight(request);
    }

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

    validateRequest(request, origin);

    const contentLengthStr = request.headers.get('content-length');
    if (contentLengthStr) {
      const contentLength = parseInt(contentLengthStr, 10);
      if (contentLength > 4.5 * 1024 * 1024) {
        throw new AppError('Payload Too Large. Vercel limits payloads to 4.5 MB', 413);
      }
    }

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
      
      'forwarded',
      'x-real-ip',
      'cf-connecting-ip',
      'true-client-ip',
      'x-amzn-trace-id',
      'x-invocation-id',
    ]);

    for (const [key, value] of request.headers.entries()) {
      const lowerKey = key.toLowerCase();
      
      if (headersToSkip.has(lowerKey)) {
        continue;
      }
      
      if (lowerKey.startsWith('x-vercel-')) {
        continue;
      }
      
      if (lowerKey.startsWith('x-forwarded-')) {
        continue;
      }

      targetHeaders.set(key, value);
    }

    targetHeaders.set('host', targetUrl.host);
    targetHeaders.set('x-request-id', reqId);

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
    
    const fetchOptions: RequestInit & { duplex?: 'half' } = {
      method,
      headers: targetHeaders,
      body: isGetOrHead ? null : request.body,
      duplex: isGetOrHead ? undefined : 'half',
      signal: combinedSignal,
    };

    const upstreamResponse = await fetch(targetUrl.href, fetchOptions);
    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;
    logger.info('Upstream response received', {
      status: upstreamResponse.status,
      durationMs,
    });

    const finalHeaders = getCorsHeaders(origin);
    const skippedUpstreamHeaders = new Set([
      'connection',
      'keep-alive',
      'transfer-encoding',
      'content-encoding',
      'content-length',
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

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: finalHeaders,
    });

  } catch (error) {
    const durationMs = Date.now() - startTime;
    return handleRouteError(error, logger, request.headers.get('origin'), durationMs);
  }
}
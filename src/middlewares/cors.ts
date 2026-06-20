export function handleCorsPreflight(request: Request): Response {
  const origin = request.headers.get('origin');
  const headers = getCorsHeaders(origin);
  
  headers.set('Access-Control-Max-Age', '86400'); // Cache preflight response for 24 hours
  
  const reqHeaders = request.headers.get('access-control-request-headers');
  if (reqHeaders) {
    headers.set('Access-Control-Allow-Headers', reqHeaders);
  }

  return new Response(null, {
    status: 204, // No Content for standard CORS preflights
    headers,
  });
}

export function getCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || '*';

  if (allowedOriginsEnv === '*') {
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true'); // Dynamic reflection required when using credentials
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
  }

  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Proxy-API-Key');
  headers.set('Access-Control-Expose-Headers', '*');
  
  return headers;
}
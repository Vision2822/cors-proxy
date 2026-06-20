import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleProxy } from './proxy.js';

describe('CORS Proxy Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ALLOWED_ORIGINS = '*';
    process.env.PROXY_API_KEY = '';
  });

  it('should reject requests lacking a url query parameter', async () => {
    const request = new Request('https://proxy.com/api');
    const response = await handleProxy(request);
    
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toContain('Missing "url" query parameter');
  });

  it('should reject malformed or relative target URLs', async () => {
    const request = new Request('https://proxy.com/api?url=not-a-valid-url');
    const response = await handleProxy(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain('Invalid "url" query parameter');
  });

it('should pass-through OPTIONS preflight checks with correct CORS headers', async () => {
    process.env.ALLOWED_ORIGINS = 'https://my-app.com';

    const request = new Request('https://proxy.com/api', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://my-app.com',
        'Access-Control-Request-Headers': 'Content-Type, X-Test',
      },
    });

    const response = await handleProxy(request);

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://my-app.com');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-Test');
  });

  it('should enforce API Key authorization if PROXY_API_KEY is defined', async () => {
    process.env.PROXY_API_KEY = 'super-secret-key';
    const request = new Request('https://proxy.com/api?url=https://target.com/api');
    
    const response = await handleProxy(request);
    expect(response.status).toBe(401);

    const badRequest = new Request('https://proxy.com/api?url=https://target.com/api', {
      headers: { 'X-Proxy-API-Key': 'wrong-key' },
    });
    const badRes = await handleProxy(badRequest);
    expect(badRes.status).toBe(401);

    const goodRequest = new Request('https://proxy.com/api?url=https://target.com/api', {
      headers: { 'X-Proxy-API-Key': 'super-secret-key' },
    });
    
    const mockResponse = new Response('{"ok":true}', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const goodRes = await handleProxy(goodRequest);
    expect(goodRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('should enforce Origin allowlisting if ALLOWED_ORIGINS is active', async () => {
    process.env.ALLOWED_ORIGINS = 'https://trusted.com,https://another.com';
    
    const request = new Request('https://proxy.com/api?url=https://target.com/api', {
      headers: { 'Origin': 'https://attacker.com' },
    });

    const response = await handleProxy(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('FORBIDDEN');

    const trustedRequest = new Request('https://proxy.com/api?url=https://target.com/api', {
      headers: { 'Origin': 'https://trusted.com' },
    });

    const mockResponse = new Response('{"data":1}', { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const trustedRes = await handleProxy(trustedRequest);
    expect(trustedRes.status).toBe(200);
  });

  it('should enforce the Vercel 4.5 MB request body limit', async () => {
    const hugeBodyRequest = new Request('https://proxy.com/api?url=https://target.com/api', {
      method: 'POST',
      headers: {
        'Content-Length': '5000000', // ~5MB (exceeds 4.5MB)
      },
    });

    const response = await handleProxy(hugeBodyRequest);
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
import { AppError } from '../utils/errors.js';

export function validateRequest(request: Request, origin: string | null): void {
  // 1. API Key Authentication Check
  const configApiKey = process.env.PROXY_API_KEY;
  if (configApiKey) {
    const clientKey = request.headers.get('x-proxy-api-key') || 
                      request.headers.get('authorization')?.replace(/^bearer\s+/i, '');
    if (!clientKey || clientKey !== configApiKey) {
      throw new AppError('Unauthorized: Missing or invalid proxy API Key', 401, 'UNAUTHORIZED');
    }
  }

  // 2. Strict Origin Allow-listing Validation
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  if (allowedOriginsEnv && allowedOriginsEnv !== '*') {
    const allowedList = allowedOriginsEnv.split(',').map(o => o.trim().toLowerCase());
    
    if (!origin) {
      throw new AppError('Forbidden: Missing Origin header. Secure proxy enforces origin check', 403, 'FORBIDDEN');
    }

    if (!allowedList.includes(origin.toLowerCase())) {
      throw new AppError(`Forbidden: Origin "${origin}" is not authorized`, 403, 'FORBIDDEN');
    }
  }
}
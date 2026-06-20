import { handleProxy } from '../src/handlers/proxy';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleProxy(request);
  }
};
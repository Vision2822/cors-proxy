import { handleProxy } from '../src/handlers/proxy.js';


export default {
  async fetch(request: Request): Promise<Response> {
    return handleProxy(request);
  }
};
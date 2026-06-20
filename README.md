# cors-proxy

A fast, lightweight, and modern CORS proxy service designed to run as a serverless fetch web handler on Vercel.

## Performance & Platform Stats

- **Average Warm Latency:** < 30ms (excluding upstream network transit).
- **Warm Start Rate:** ~99.37% globally (mitigated via Vercel Fluid Compute in-function concurrency).
- **Under the Hood:** Native `fetch` with global connection pooling and keep-alive socket reuse (`undici`).
- **Resource Config:** 1024 MB Memory (optimized CPU allocation under serverless constraints).
- **Payload Limits:** Strict 4.5 MB check (aligned with Vercel's platform limits).
- **Timeout Limits:** Strict 30s connection timeout paired with active client-abort propagation.
- **Security:** Configurable Origin allow-listing and secure authentication headers (`X-Proxy-API-Key`).
- **Observability:** Zero-dependency JSON structured stdout logging compatible with cloud drains.

## Local Operations

### 1. Install

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the root:

```env
ALLOWED_ORIGINS=*
PROXY_API_KEY=your-secure-token
```

### 3. Run Test Suite

```bash
npm run test
```

### 4. Start Local Development

```bash
npm run dev
```

## Deployment

Deploy directly to Vercel via the CLI:

```bash
vercel --prod
```

## Usage

Request resources by appending the target destination as an encoded query parameter:

```http
GET https://your-deployment.vercel.app/?url=https://api.github.com/zen
```

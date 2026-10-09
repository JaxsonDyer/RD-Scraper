// Best-effort per-instance limiter for anonymous reads. Each serverless instance
// keeps its own counts, so this blunts a single noisy client rather than a botnet.
const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;

export function createRateLimiter(limit: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; reset: number }>();
  return function allow(key: string) {
    const time = now();
    if (hits.size >= MAX_KEYS) for (const [k, v] of hits) if (v.reset <= time) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || entry.reset <= time) {
      if (hits.size >= MAX_KEYS) return true;
      hits.set(key, { count: 1, reset: time + WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

export function clientKey(request: Request) {
  // Vercel sets these headers itself, so clients cannot spoof them in production.
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

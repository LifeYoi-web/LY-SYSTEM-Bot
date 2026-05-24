import type { Request, RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Bucket key. Defaults to the logged-in user id, falling back to the request IP. */
  key?: (req: Request) => string;
}

/**
 * Tiny dependency-free fixed-window limiter. Buckets live in memory, which is
 * fine for this single-process deployment; mod actions are low-volume.
 */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();

  return (req, res, next) => {
    const key = opts.key ? opts.key(req) : req.session?.user?.id ?? req.ip ?? 'anon';
    const now = Date.now();
    // Evict expired buckets opportunistically so the map stays bounded.
    if (hits.size > 5000) {
      for (const [k, e] of hits) if (now > e.reset) hits.delete(k);
    }
    let entry = hits.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(opts.max - entry.count, 0);
    res.setHeader('X-RateLimit-Limit', String(opts.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      res.status(429).json({ error: 'too many requests, slow down' });
      return;
    }
    next();
  };
}

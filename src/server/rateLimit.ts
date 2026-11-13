import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Prune stale keys periodically to keep memory bounded
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, bucket] of buckets.entries()) {
    const recent = bucket.timestamps.filter((ts) => ts > cutoff);
    if (recent.length === 0) {
      buckets.delete(key);
    } else {
      bucket.timestamps = recent;
    }
  }
}, 5 * 60 * 1000).unref();

export function createRateLimiter(options: {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() ||
      req.ip ||
      'unknown';

    const bucketKey = `${options.keyPrefix}:${clientIp}`;
    const now = Date.now();
    const windowStart = now - options.windowMs;

    const existing = buckets.get(bucketKey);
    const active = existing ? existing.timestamps.filter((ts) => ts > windowStart) : [];

    if (active.length >= options.maxRequests) {
      const oldest = active[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error:
          options.message ||
          'Too many requests from this network. Please wait a moment and try again.',
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    active.push(now);
    buckets.set(bucketKey, { timestamps: active });
    next();
  };
}

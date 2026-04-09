// Rate limiting middleware - 30 requests per hour per IP
// In-memory storage: Map<IP, {count: number, resetAt: number}>

const rateLimitStore = new Map();

// Configuration from environment or defaults
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000', 10); // 1 hour in ms
const CLEANUP_INTERVAL_MS = 600000; // 10 minutes

/**
 * Extract client IP from request
 */
function getClientIP(req) {
  return req.ip || 
         req.headers['x-forwarded-for'] || 
         req.connection?.remoteAddress || 
         'unknown';
}

/**
 * Check if IP is rate limited
 * Returns: { allowed: boolean, retryAfter?: number, currentCount: number, limit: number }
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record) {
    // First request from this IP
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, currentCount: 1, limit: RATE_LIMIT_MAX };
  }

  // Check if window has expired
  if (now >= record.resetAt) {
    // Reset the window
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, currentCount: 1, limit: RATE_LIMIT_MAX };
  }

  // Within window, check count
  if (record.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter, currentCount: record.count, limit: RATE_LIMIT_MAX };
  }

  // Increment count
  record.count++;
  return { allowed: true, currentCount: record.count, limit: RATE_LIMIT_MAX };
}

/**
 * Cleanup expired entries from the rate limit store
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now >= record.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}

// Start cleanup interval
setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);

/**
 * Express middleware function
 */
export function rateLimitMiddleware(req, res, next) {
  const ip = getClientIP(req);
  const result = checkRateLimit(ip);

  // Add rate limit headers to all API responses
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', result.allowed ? (RATE_LIMIT_MAX - result.currentCount) : 0);
  res.setHeader('X-RateLimit-Reset', Date.now() + RATE_LIMIT_WINDOW_MS);

  if (!result.allowed) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: result.retryAfter
    });
    res.setHeader('Retry-After', result.retryAfter);
    return;
  }

  next();
}

// Export cleanup function for testing
export function cleanupStore() {
  rateLimitStore.clear();
}

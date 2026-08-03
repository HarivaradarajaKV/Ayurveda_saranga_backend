// Simple high-performance in-memory TTL API cache for public GET endpoints
const cache = new Map();
const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds default TTL

function apiCache(ttlMs = DEFAULT_TTL_MS) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = req.originalUrl || req.url;
    const cached = cache.get(key);

    if (cached && (Date.now() - cached.timestamp < ttlMs)) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    // Intercept res.json to store in cache
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        cache.set(key, {
          data: body,
          timestamp: Date.now()
        });
      }
      return originalJson(body);
    };

    res.setHeader('X-Cache', 'MISS');
    next();
  };
}

function clearCache() {
  cache.clear();
}

module.exports = { apiCache, clearCache };

// Simple high-performance in-memory TTL API cache for public GET endpoints
const cache = new Map();
const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds default TTL

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function apiCache(ttlMs = DEFAULT_TTL_MS) {
  return (req, res, next) => {
    setCorsHeaders(req, res);

    // Pass through preflight OPTIONS requests cleanly
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = req.originalUrl || req.url;
    const cached = cache.get(key);

    if (cached && (Date.now() - cached.timestamp < ttlMs)) {
      setCorsHeaders(req, res);
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    // Intercept res.json to store in cache
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      setCorsHeaders(req, res);
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

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow importing Drizzle's generated `.sql` migration files as source.
config.resolver.sourceExts.push('sql');

// expo-sqlite on web ships SQLite as a .wasm asset.
config.resolver.assetExts.push('wasm');

// SharedArrayBuffer (needed by expo-sqlite on web) requires cross-origin isolation.
// In production these headers come from vercel.json.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;

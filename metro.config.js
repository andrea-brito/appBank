const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow importing Drizzle's generated `.sql` migration files as source.
config.resolver.sourceExts.push('sql');

// expo-sqlite on web ships SQLite as a .wasm asset.
config.resolver.assetExts.push('wasm');

// Web: expo-sqlite's worker must not lock OPFS files (see src/web/memoryOnlyVFS.js).
const memoryOnlyVFS = path.join(__dirname, 'src', 'web', 'memoryOnlyVFS.js');
const workerFile = path.join('expo-sqlite', 'web', 'worker');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    moduleName === './wa-sqlite/AccessHandlePoolVFS' &&
    path.normalize(context.originModulePath).includes(workerFile)
  ) {
    return { type: 'sourceFile', filePath: memoryOnlyVFS };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

// SharedArrayBuffer (needed by expo-sqlite on web) requires cross-origin isolation.
// require-corp, not credentialless: Safari/iOS does not support credentialless and
// leaves the page non-isolated (no SharedArrayBuffer -> every DB query fails).
// In production these headers come from vercel.json.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;

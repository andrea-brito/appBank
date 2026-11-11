const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow importing Drizzle's generated `.sql` migration files as source.
config.resolver.sourceExts.push('sql');

module.exports = config;

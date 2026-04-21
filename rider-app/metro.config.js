const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Fix module resolution
config.resolver.sourceExts = ['jsx', 'js', 'ts', 'tsx', 'json', 'cjs', 'mjs'];
config.resolver.assetExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ttf', 'otf'];

// ============================================================================
// Monorepo / Workspace support
// ============================================================================
// Metro does not follow symlinks in monorepos by default.
// We add the shared packages to the watch folders and nodeModulesPaths.

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../node_modules'),
];

// Watch the shared packages for changes during development
config.watchFolders = [
  path.resolve(__dirname),
  path.resolve(__dirname, '../packages/shared-types'),
];

// Ensure symlinks are resolved properly
config.resolver.disableHierarchicalLookup = false;

module.exports = config;

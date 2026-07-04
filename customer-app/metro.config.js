const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Monorepo: ADD workspace folders to Expo's default watchFolders (replacing
// them wholesale fails expo-doctor's Metro check) and resolve from app +
// root node_modules. Do NOT set disableHierarchicalLookup — breaks pnpm
// transitive deps. Symlink support is on by default in this Metro version.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  monorepoRoot,
  path.resolve(monorepoRoot, 'packages'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  /[/\\]node_modules[/\\]@types[/\\]/,
];

config.resolver.unstable_enablePackageExports = true;

module.exports = config;

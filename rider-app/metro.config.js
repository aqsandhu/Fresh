const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Monorepo: ADD workspace folders to Expo's default watchFolders (replacing
// them wholesale fails expo-doctor's Metro check) and resolve from app +
// root node_modules. Expo's default sourceExts/assetExts already cover
// everything this app uses (ts/tsx/cjs/mjs, svg/ttf/otf, ...); symlink
// support is on by default in this Metro version.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  monorepoRoot,
  path.resolve(monorepoRoot, 'packages'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.unstable_enablePackageExports = true;

module.exports = config;

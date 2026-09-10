const { getDefaultConfig } = require("expo/metro-config");

// Expo SDK 54 auto-detects this pnpm workspace (watchFolders, nodeModulesPaths,
// symlink + packageExports resolution). Overrides only fight those defaults —
// see expo-doctor's Metro check — so adopt them as-is.
const config = getDefaultConfig(__dirname);

// Tests sit beside the code they cover and must not reach a bundle. Appended,
// not assigned — the defaults exclude ios/Pods, build output and .expo caches.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  /\.test\.[jt]sx?$/,
];

module.exports = config;

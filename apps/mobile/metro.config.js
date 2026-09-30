const path = require("path");
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

// expo-gl tries react-native-reanimated inside a try block for worklet
// support. The app doesn't ship reanimated, and pnpm links an incomplete copy
// of it, so the lookup has to fail and expo-gl falls back to plain GL.
const EXPO_GL = `${path.sep}expo-gl${path.sep}`;
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "react-native-reanimated" &&
    context.originModulePath.includes(EXPO_GL)
  ) {
    throw new Error("react-native-reanimated is not part of this app");
  }
  return (resolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;

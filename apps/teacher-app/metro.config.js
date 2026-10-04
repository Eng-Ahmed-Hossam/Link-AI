const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Concierge pilot build (EXPO_PUBLIC_LINK_MODE=pilot): `@/demo` — the Demo controls, the in-app
// mock handlers and the sample sign-in — resolves to a stub, so none of it is bundled.
if (process.env.EXPO_PUBLIC_LINK_MODE === 'pilot') {
  const stub = path.join(__dirname, 'src', 'demo', 'pilot.tsx');
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) =>
    moduleName === '@/demo'
      ? { type: 'sourceFile', filePath: stub }
      : (resolve ?? context.resolveRequest)(context, moduleName, platform);
}

module.exports = config;

// Resolve expo-superwall to its built entry so Metro matches package "exports"
// (the package only lists "import", which triggers noisy fallbacks on RN).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `package.json` resolves via exports to build/package.json — entry is sibling `src/index.js`
const superwallEntry = path.join(
  path.dirname(require.resolve('expo-superwall/package.json')),
  'src',
  'index.js',
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-superwall') {
    return { type: 'sourceFile', filePath: superwallEntry };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

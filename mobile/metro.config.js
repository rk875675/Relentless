const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

let superwallEntry = null;
try {
  superwallEntry = path.join(
    path.dirname(require.resolve('expo-superwall/package.json')),
    'src',
    'index.js',
  );
} catch {}

if (superwallEntry) {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'expo-superwall') {
      return { type: 'sourceFile', filePath: superwallEntry };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;

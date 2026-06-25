const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Dodanie obsługi plików .tflite i .bin (na przyszłość)
config.resolver.assetExts.push('tflite', 'bin');

module.exports = config;

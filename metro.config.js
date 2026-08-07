// metro.config.js
//
// FIX: "attempted to import the Node standard library module crypto"
// dari isomorphic-git.
//
// isomorphic-git punya "exports" map di package.json:
//   - kondisi "node"    -> index.cjs (require('crypto'), khusus Node.js)
//   - kondisi "default" -> index.js  (ESM, aman untuk RN/browser)
//
// Expo SDK 51 belum mengaktifkan resolusi "exports" secara default
// (baru default mulai SDK 53), jadi Metro jatuh balik ke field lama
// "main" -> index.cjs -> crash karena 'crypto' tidak ada di RN.
//
// Mengaktifkan unstable_enablePackageExports membuat Metro membaca
// "exports" map itu dengan benar, sehingga jatuh ke kondisi "default"
// (index.js) yang tidak butuh 'crypto'.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;

// Kondisi yang dicoba Metro secara berurutan. Tidak ada kondisi "node"
// di sini secara sengaja - itu yang memicu bug ini kalau ke-pilih.
config.resolver.unstable_conditionNames = ['require', 'react-native', 'default'];

module.exports = config;

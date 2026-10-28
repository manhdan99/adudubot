const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = __dirname;
const srcDevDir = path.join(rootDir, 'src_dev');

if (!fs.existsSync(srcDevDir)) {
  fs.mkdirSync(srcDevDir, { recursive: true });
}

if (!fs.existsSync(path.join(srcDevDir, 'server.js'))) {
  fs.copyFileSync(path.join(rootDir, 'server.js'), path.join(srcDevDir, 'server.js'));
}

if (!fs.existsSync(path.join(srcDevDir, 'app.js'))) {
  fs.copyFileSync(path.join(rootDir, 'public', 'app.js'), path.join(srcDevDir, 'app.js'));
}

const serverSource = fs.readFileSync(path.join(srcDevDir, 'server.js'), 'utf8');
const obfuscatedServer = JavaScriptObfuscator.obfuscate(serverSource, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  target: 'node'
}).getObfuscatedCode();

fs.writeFileSync(path.join(rootDir, 'server.js'), obfuscatedServer, 'utf8');

const appSource = fs.readFileSync(path.join(srcDevDir, 'app.js'), 'utf8');
const obfuscatedApp = JavaScriptObfuscator.obfuscate(appSource, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  target: 'browser'
}).getObfuscatedCode();

fs.writeFileSync(path.join(rootDir, 'public', 'app.js'), obfuscatedApp, 'utf8');
console.log('Da ma hoa thanh cong server.js va public/app.js!');

// tauri ios init 生成的 project.yml 有两处跟我们的构建对不上 每次 init 后都得补
// 补完必须 xcodegen generate 否则 pbxproj 还是旧的
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const apple = path.join(root, 'src-tauri/gen/apple');
const file = path.join(apple, 'project.yml');
const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const min = config.bundle.iOS.minimumSystemVersion;
let yml = fs.readFileSync(file, 'utf8');

/* tauri 按 minimumSystemVersion 直接改 pbxproj 不改 yml 里写死的 14.0
   一旦重新 generate 就退回 14.0 Xcode 27 只认 15.0 起 */
const dt = /(deploymentTarget:\s*\r?\n\s*iOS:\s*)[\d.]+/;
assert.ok(dt.test(yml), 'project.yml 里找不到 deploymentTarget.iOS');
yml = yml.replace(dt, '$1' + min);

// Externals 整个目录被当资源 debug 和 release 的 libapp.a 都进包 白多几百 MB
const ext = /^(\s*)- path: Externals\r?\n(?!\1  excludes:)/m;
if(ext.test(yml)) yml = yml.replace(ext, (m, ind) => m + ind + '  excludes:\n' + ind + '    - "**/*.a"\n');
assert.ok(/- path: Externals\r?\n\s*excludes:/.test(yml), 'project.yml 里找不到 Externals 那条 source');

fs.writeFileSync(file, yml);
execFileSync('xcodegen', ['generate', '--spec', file], {cwd: apple, stdio: 'inherit'});
console.log('Patched project.yml (iOS ' + min + ', Externals without .a) and regenerated');

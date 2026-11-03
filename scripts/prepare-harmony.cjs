// 先 npm run build:web 再跑这个 拷的是 dist/ 不是 src/
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
if(!fs.existsSync(path.join(dist, 'index.html'))) throw Error('dist/index.html 不存在 先 npm run build:web');
const target = path.join(root, 'src-harmony/entry/src/main/resources/rawfile/web');
fs.rmSync(target, {recursive:true, force:true});
fs.mkdirSync(target, {recursive:true});
fs.cpSync(dist, target, {recursive:true});
fs.copyFileSync(path.join(root, 'scripts/harmony-bridge.js'), path.join(target, 'harmony-bridge.js'));
const index = path.join(target, 'index.html');
// 桥要在 module 脚本之前装好 platform/save.js 一加载就读 window.__TAURI__
fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('<head>', '<head>\n<script src="harmony-bridge.js"></script>'));
const icons = path.join(root, 'src-harmony/AppScope/resources/base/media');
fs.mkdirSync(icons, {recursive:true});
fs.copyFileSync(path.join(root, 'src-tauri/icons/icon.png'), path.join(icons, 'icon.png'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const appPath = path.join(root, 'src-harmony/AppScope/app.json5');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
app.app.bundleName = config.identifier;
// versionCode 只认数字 3.0.0-dev 这种预发布后缀要去掉
const version = config.version.replace(/-.*$/, '');
app.app.versionName = config.version;
const [major, minor, patch] = version.split('.').map(Number);
app.app.versionCode = major*10000 + minor*100 + patch;
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
console.log('Prepared local frontend for HarmonyOS', config.version);

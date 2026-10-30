const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const catalog = path.join(root,'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset');
const manifest = JSON.parse(fs.readFileSync(path.join(catalog,'Contents.json'),'utf8'));
let count = 0;
for(const image of manifest.images){
  assert.ok(image.filename && path.basename(image.filename) === image.filename,'Invalid icon filename');
  const source = path.join(root,'src-tauri/icons/ios',image.filename);
  const data = fs.readFileSync(source);
  assert.equal(data.subarray(1,4).toString(),'PNG','Icon must be PNG');
  const [width,height] = image.size.split('x').map(Number);
  const scale = Number.parseFloat(image.scale);
  assert.equal(data.readUInt32BE(16),Math.round(width*scale),'Incorrect icon width: '+image.filename);
  assert.equal(data.readUInt32BE(20),Math.round(height*scale),'Incorrect icon height: '+image.filename);
  const target = path.join(catalog,image.filename);
  fs.copyFileSync(source,target);
  assert.deepEqual(fs.readFileSync(target),data);
  count++;
}
assert.ok(count>=18,'Incomplete iOS icon catalog');
console.log('Staged and verified '+count+' CigeChan iOS icons');

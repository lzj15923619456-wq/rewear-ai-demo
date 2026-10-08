const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const references = JSON.parse(fs.readFileSync(path.join(root,'references-new.json'),'utf8')).filter(r=>r.publishable);
assert.equal(new Set(references.map(r=>r.id)).size,references.length,'重复参考 ID');
assert.equal(new Set(references.map(r=>r.image)).size,references.length,'重复参考图片');
for (const ref of references) {
  assert.ok(ref.credit && ref.license && ref.licenseUrl && ref.description,'参考来源资料不完整');
  assert.ok(fs.existsSync(path.join(root,'dist',ref.image)),'参考文件缺失');
}
fs.writeFileSync(path.join(root,'references.json'),JSON.stringify(references,null,2)+'\n');
console.log('Active reference index:',references.length,'licensed photos');

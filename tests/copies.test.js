const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('apps-script/core.js is an exact copy of assets/core.js (run npm run sync)', () => {
  const root = path.join(__dirname, '..');
  const a = fs.readFileSync(path.join(root, 'assets/core.js'), 'utf8');
  const b = fs.readFileSync(path.join(root, 'apps-script/core.js'), 'utf8');
  assert.equal(b, a);
});

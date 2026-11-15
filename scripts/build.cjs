'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src');
const output = path.join(root, 'dist');
// Fixed, repository-local output only. Source and original development files are never removed.
if (path.dirname(output) !== root || path.basename(output) !== 'dist')
  throw new Error('Invalid output directory');
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
console.log('Built static game in dist/');

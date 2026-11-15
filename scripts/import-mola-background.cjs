'use strict';
// Rebuild the measured Gale background from NASA's MOLA MEGDR topography tile.
// The parser validates source labels, registration, byte order and elevation range.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DEM = require('../src/mola-import.js');
const root = path.resolve(__dirname, '..');
const cacheDir = path.join(root, 'artifacts', 'mola-background-source');
fs.mkdirSync(cacheDir, { recursive: true });
async function read(url, start, end) {
  const name =
    path.basename(new URL(url).pathname) + (start === undefined ? '' : `.${start}-${end}`);
  const cache = path.join(cacheDir, name);
  if (fs.existsSync(cache)) return fs.readFileSync(cache);
  const headers = start === undefined ? {} : { Range: `bytes=${start}-${end - 1}` };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error(`NASA source ${response.status}: ${url}`);
  if (start !== undefined) {
    const expected = `bytes ${start}-${end - 1}/129761280`;
    if (response.status !== 206 || response.headers.get('content-range') !== expected)
      throw Error(`Source did not honor bounded range: ${response.headers.get('content-range')}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (start !== undefined && bytes.length !== end - start) throw Error('Truncated range');
  fs.writeFileSync(cache, bytes);
  console.log('Downloaded', name, bytes.length, 'bytes');
  return bytes;
}
(async () => {
  const label = (await read(DEM.base + DEM.product + '.lbl')).toString('ascii');
  const file = {
    name: DEM.product + '.img',
    size: 129761280,
    slice(start, end) {
      return {
        async arrayBuffer() {
          const bytes = await read(DEM.base + DEM.product + '.img', start, end);
          file.rangeSHA256 = crypto.createHash('sha256').update(bytes).digest('hex');
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
      };
    },
  };
  const data = await DEM.importTile(file, label);
  data.source.rangeSHA256 = file.rangeSHA256;
  data.source.labelSHA256 = crypto.createHash('sha256').update(label).digest('hex');
  DEM.validateGrid(data);
  fs.writeFileSync(
    path.join(root, 'src', 'mola-background.js'),
    "'use strict';\n// Measured NASA MOLA Gale crop. Rebuild: node scripts/import-mola-background.cjs\nconst MOLA_BACKGROUND_DATA = " +
      JSON.stringify(data) +
      ';\n',
  );
  console.log(
    'Wrote',
    data.columns,
    'x',
    data.rows,
    'measured grid; range',
    data.minLegend,
    data.maxLegend,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

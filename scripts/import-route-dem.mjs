// Rebuild the bundled route elevation grid from the USGS/JPL Gale mosaic.
// Only every fifth 1m strip is downloaded; the 3.6GB original stays remote.
import fs from 'node:fs';
import vm from 'node:vm';
import { fromUrl } from 'geotiff';
const url = 'https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif';
const sourcePage = 'https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m';
const context = vm.createContext({});
vm.runInContext(
  fs.readFileSync('src/traverse-data.js', 'utf8') + ';globalThis.coords=NASA_TRAVERSE_COORDINATES;',
  context,
);
const radius = 3396190,
  radians = Math.PI / 180,
  spacing = 5,
  buffer = 500;
const tiff = await fromUrl(url, { blockSize: 65536, cacheSize: 100 });
const image = await tiff.getImage();
const [ox, oy] = image.getOrigin();
const [sx, sy] = image.getResolution();
const keys = image.getGeoKeys();
if (
  sx !== 1 ||
  sy !== -1 ||
  keys.GeogSemiMajorAxisGeoKey !== radius ||
  keys.ProjCenterLongGeoKey !== 0 ||
  keys.ProjStdParallel1GeoKey !== 0 ||
  keys.GTRasterTypeGeoKey !== 2
)
  throw Error('Unexpected source projection or pixel registration');
const xs = context.coords.map((p) => p[0] * radians * radius),
  ys = context.coords.map((p) => p[1] * radians * radius);
const x0 = Math.max(0, Math.floor((Math.min(...xs) - buffer - ox) / spacing) * spacing);
const y0 = Math.max(0, Math.floor((oy - Math.max(...ys) - buffer) / spacing) * spacing);
const x1 = Math.min(
  image.getWidth() - 1,
  Math.ceil((Math.max(...xs) + buffer - ox) / spacing) * spacing,
);
const y1 = Math.min(
  image.getHeight() - 1,
  Math.ceil((oy - Math.min(...ys) + buffer) / spacing) * spacing,
);
const columns = Math.floor((x1 - x0) / spacing) + 1,
  rows = Math.floor((y1 - y0) / spacing) + 1;
const heights = new Float32Array(columns * rows),
  nodata = image.getGDALNoData();
let cursor = 0,
  completed = 0,
  missing = 0;
console.log({ columns, rows, x0, y0, x1, y1 });
fs.mkdirSync('artifacts/route-dem-rows', { recursive: true });
async function worker() {
  for (;;) {
    const row = cursor++;
    if (row >= rows) return;
    const y = y0 + row * spacing;
    const cache = `artifacts/route-dem-rows/${x0}-${y}-${columns}-${spacing}.bin`;
    let values;
    if (fs.existsSync(cache)) {
      const b = fs.readFileSync(cache);
      values = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    } else {
      let result;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          result = await image.readRasters({
            window: [x0, y, x0 + (columns - 1) * spacing + 1, y + 1],
            samples: [0],
            interleave: true,
          });
          break;
        } catch (error) {
          if (attempt === 3) throw error;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      values = new Float32Array(columns);
      for (let x = 0; x < columns; x++) values[x] = result[x * spacing];
      fs.writeFileSync(cache, Buffer.from(values.buffer));
    }
    for (let x = 0; x < columns; x++) {
      const value = values[x];
      // Published mosaic range also rejects zero-filled/truncated decode output.
      if (!Number.isFinite(value) || value === nodata || value < -4626 || value > -322) missing++;
      heights[row * columns + x] = value;
    }
    if (++completed % 100 === 0 || completed === rows)
      console.log(`DEM strips ${completed}/${rows}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
if (missing)
  throw Error(`Source contains ${missing} nodata samples; do not publish without masked coverage`);
const data = {
  kind: 'usgs-gale-route-dem',
  columns,
  rows,
  west: (ox + x0) / radius / radians,
  north: (oy - y0) / radius / radians,
  longitudeStep: spacing / radius / radians,
  latitudeStep: -spacing / radius / radians,
  spacingMeters: spacing,
  radiusMeters: radius,
  nodata,
  source: {
    title: 'MSL Gale Merged DEM 1m v3 - 5m route subset',
    url,
    page: sourcePage,
    credit:
      'Fred Calef III and Tim Parker, NASA/JPL-Caltech; USGS Astrogeology; HiRISE/CTX/HRSC/MOLA',
    retrieved: new Date().toISOString().slice(0, 10),
    pixelRegistration: 'PixelIsPoint',
    method:
      'Every fifth native 1m sample; 500m route buffer; heights rounded to 0.001m, not interpolated',
    sourceOrigin: [ox, oy],
    sourceWindow: [x0, y0, x1, y1],
  },
  heights: Array.from(heights, (v) => Math.round(v * 1000) / 1000),
};
fs.writeFileSync(
  'src/route-dem-data.js',
  "'use strict';\n// Measured USGS/JPL DEM subset. Rebuild with node scripts/import-route-dem.mjs.\nconst ROUTE_DEM_DATA = " +
    JSON.stringify(data) +
    ';\n',
);
console.log(
  'Wrote measured route elevations',
  fs.statSync('src/route-dem-data.js').size,
  'bytes',
  Math.min(...heights.subarray(0, columns)),
);

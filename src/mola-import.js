'use strict';
// NASA MOLA MEGDR parser. Specification and product URLs are retained in output.
// Only the Gale-containing 128 ppd TOPOGRAPHY tile is accepted, never radius data.
const GaleDEM = (() => {
  const base =
    'https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg128/';
  const product = 'megt00n090hb';
  const ppd = 128,
    tileWidth = 11520,
    tileHeight = 5632;
  const bounds = { west: 135.9, east: 139.5, north: -3.7, south: -7.2 };
  const radius = 3396000,
    standardParallel = -5.44;
  const col0 = Math.floor((bounds.west - 90) * ppd),
    col1 = Math.ceil((bounds.east - 90) * ppd);
  const row0 = Math.floor(-bounds.north * ppd),
    row1 = Math.ceil(-bounds.south * ppd);
  const columns = col1 - col0 + 1,
    rows = row1 - row0 + 1;
  const north = -(row0 + 0.5) / ppd,
    west = 90 + (col0 + 0.5) / ppd;
  const dy = (Math.PI * radius) / 180 / ppd,
    dx = dy * Math.cos((standardParallel * Math.PI) / 180);

  function validateLabel(text) {
    if (typeof text !== 'string' || text.length > 100000) throw Error('Invalid PDS label.');
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const fields = {};
    for (const line of clean.split(/\r?\n/)) {
      const match = line.match(/^\s*([\w^]+)\s*=\s*(.*?)\s*$/);
      if (match)
        fields[match[1]] = match[2]
          .replace(/^"|"$/g, '')
          .replace(/\s*<[^>]+>/g, '')
          .trim();
    }
    function expect(key, expected) {
      const actual = fields[key];
      if (
        typeof expected === 'number'
          ? Number(actual) !== expected
          : actual?.toUpperCase() !== expected.toUpperCase()
      )
        throw Error('Unsupported MOLA label: ' + key + ' must be ' + expected + '.');
    }
    expect('PDS_VERSION_ID', 'PDS3');
    expect('^IMAGE', product + '.img');
    expect('DATA_SET_ID', 'MGS-M-MOLA-5-MEGDR-L3-V1.0');
    expect('INSTRUMENT_ID', 'MOLA');
    expect('TARGET_NAME', 'MARS');
    expect('LINES', tileHeight);
    expect('LINE_SAMPLES', tileWidth);
    expect('SAMPLE_TYPE', 'MSB_INTEGER');
    expect('SAMPLE_BITS', 16);
    expect('MAP_RESOLUTION', 128);
    expect('UNIT', 'METER');
    expect('MAP_PROJECTION_TYPE', 'SIMPLE CYLINDRICAL');
    expect('POSITIVE_LONGITUDE_DIRECTION', 'EAST');
    expect('COORDINATE_SYSTEM_NAME', 'PLANETOCENTRIC');
    expect('MAXIMUM_LATITUDE', 0);
    expect('MINIMUM_LATITUDE', -44);
    expect('WESTERNMOST_LONGITUDE', 90);
    expect('EASTERNMOST_LONGITUDE', 180);
    expect('A_AXIS_RADIUS', 3396);
    if (fields.SCALING_FACTOR !== undefined) expect('SCALING_FACTOR', 1);
    if (fields.OFFSET !== undefined) expect('OFFSET', 0);
    if (fields.MAP_PROJECTION_ROTATION !== undefined) expect('MAP_PROJECTION_ROTATION', 0);
    if (fields.LINE_PREFIX_BYTES !== undefined) expect('LINE_PREFIX_BYTES', 0);
    if (fields.LINE_SUFFIX_BYTES !== undefined) expect('LINE_SUFFIX_BYTES', 0);
    return fields;
  }

  async function importTile(file, labelText) {
    validateLabel(labelText);
    if (file.name.toLowerCase() !== product + '.img') throw Error('Select ' + product + '.img.');
    if (file.size !== tileWidth * tileHeight * 2)
      throw Error('Incomplete or wrong tile: expected 129,761,280 bytes.');
    const heights = new Array(columns * rows);
    let min = Infinity,
      max = -Infinity;
    // Read only Gale rows (~10 MB), keeping the 130 MB source out of browser memory.
    const start = row0 * tileWidth * 2;
    const bytes = await file.slice(start, (row1 + 1) * tileWidth * 2).arrayBuffer();
    if (bytes.byteLength !== (row1 - row0 + 1) * tileWidth * 2) throw Error('Truncated tile read.');
    const view = new DataView(bytes);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const value = view.getInt16((y * tileWidth + col0 + x) * 2, false);
        if (value < -10000 || value > 22000)
          throw Error('Invalid elevation or missing-data sentinel in Gale crop.');
        heights[y * columns + x] = value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    const data = {
      schemaVersion: 1,
      kind: 'mola-megdr',
      product: product.toUpperCase(),
      columns,
      rows,
      widthMeters: (columns - 1) * dx,
      heightMeters: (rows - 1) * dy,
      minLegend: Math.floor(min / 500) * 500,
      maxLegend: Math.ceil(max / 500) * 500,
      geo: {
        north,
        west,
        latitudeStep: -1 / ppd,
        longitudeStep: 1 / ppd,
        standardParallel,
        radiusMeters: radius,
        coordinateSystem: 'IAU 2000 planetocentric, east-positive',
        verticalDatum: 'MOLA areoid',
      },
      source: {
        image: base + product + '.img',
        label: base + product + '.lbl',
        documentation: 'https://pds-geosciences.wustl.edu/missions/mgs/megdr.html',
        importedAt: new Date().toISOString(),
        crop: { col0, row0, col1, row1 },
        method:
          'Native cell-center samples; big-endian signed 16-bit metres. No smoothing or elevation rescaling. Cell centers derived from tile bounds and dimensions, avoiding historical projection-offset label inconsistencies.',
      },
      heights,
    };
    validateGrid(data);
    return data;
  }
  function validateGrid(m) {
    if (
      !m ||
      m.schemaVersion !== 1 ||
      m.kind !== 'mola-megdr' ||
      m.product !== product.toUpperCase()
    )
      throw Error('Not a supported Gale MOLA crop.');
    if (m.source?.image !== base + product + '.img' || m.source?.label !== base + product + '.lbl')
      throw Error('Missing source provenance.');
    if (
      m.columns !== columns ||
      m.rows !== rows ||
      !Array.isArray(m.heights) ||
      m.heights.length !== columns * rows
    )
      throw Error('Wrong grid dimensions.');
    if (
      m.geo?.north !== north ||
      m.geo?.west !== west ||
      m.geo.latitudeStep !== -1 / ppd ||
      m.geo.longitudeStep !== 1 / ppd ||
      m.geo.standardParallel !== standardParallel ||
      m.geo.radiusMeters !== radius
    )
      throw Error('Invalid georeferencing.');
    if (
      Math.abs(m.widthMeters - (columns - 1) * dx) > 0.000001 ||
      Math.abs(m.heightMeters - (rows - 1) * dy) > 0.000001
    )
      throw Error('Invalid physical scale.');
    let min = Infinity,
      max = -Infinity;
    for (const h of m.heights) {
      if (!Number.isInteger(h) || h < -10000 || h > 22000) throw Error('Invalid elevation.');
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    if (
      m.minLegend !== Math.floor(min / 500) * 500 ||
      m.maxLegend !== Math.ceil(max / 500) * 500 ||
      min === max
    )
      throw Error('Invalid height range.');
    return m;
  }
  return {
    importTile,
    validateLabel,
    validateGrid,
    base,
    product,
    bounds,
    columns,
    rows,
    col0,
    row0,
  };
})();
if (typeof module !== 'undefined') module.exports = GaleDEM;

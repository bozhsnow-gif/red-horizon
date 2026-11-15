'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dem, label, tile } = require('./helpers/mola.cjs');
const { createGame } = require('./helpers/game.cjs');
const dataPromise = dem.importTile(tile(), label);

test('MOLA rejects wrong products, frames, endianness and incomplete reads', async () => {
  dem.validateLabel(label);
  for (const [from, to] of [
    ['MSB_INTEGER', 'LSB_INTEGER'],
    ['MEGT00N090HB.IMG', 'MEGR00N090HB.IMG'],
    ['OFFSET = 0', 'OFFSET = 3396000'],
    ['128 <PIXEL/DEGREE>', '64 <PIXEL/DEGREE>'],
    ['PLANETOCENTRIC', 'PLANETOGRAPHIC'],
  ])
    assert.throws(() => dem.validateLabel(label.replace(from, to)));
  await assert.rejects(() => dem.importTile({ ...tile(), size: 42 }, label));
  await assert.rejects(() => dem.importTile(tile({ invalid: true }), label));
  await assert.rejects(() => dem.importTile(tile({ truncated: true }), label));
});

test('Synthetic binary fixture independently verifies big-endian values and row stride', async () => {
  const data = await dataPromise;
  assert.equal(data.heights[0], -4500);
  assert.equal(data.heights[1], -4498);
  assert.equal(data.heights[data.columns], -4497);
  assert(data.widthMeters > 200000 && data.widthMeters < 220000);
  assert(data.heightMeters > 200000 && data.heightMeters < 215000);
  assert.throws(() =>
    dem.validateGrid({ ...data, geo: { ...data.geo, north: data.geo.north + 1 / 128 } }),
  );
  assert.throws(() => dem.validateGrid({ ...data, heights: data.heights.slice(1) }));
  assert.throws(() => dem.validateGrid({ ...data, widthMeters: data.widthMeters * 0.7 }));
});

test('Imported native grid preserves metre scale, cell-center geography and triangle interpolation', async () => {
  const game = createGame({ measuredData: await dataPromise }),
    run = game.evaluate;
  assert.equal(run('Gale.measured'), true);
  assert.equal(run('Gale.terrainScale'), 1);
  const corner = run('Gale.coordinates(0,0)');
  assert.equal(corner.latitude, -(Math.floor(3.7 * 128) + 0.5) / 128);
  assert.equal(corner.longitude, 90 + (Math.floor((135.9 - 90) * 128) + 0.5) / 128);
  const height = run(
    'Gale.elevationMeters(Gale.mapPoint(12.25,17.75).x,Gale.mapPoint(12.25,17.75).y)',
  );
  assert(Math.abs(height - (-4500 + 12.25 * 2 + 17.75 * 3)) < 1e-8);
  const landing = run(
    '(()=>{const p=Gale.mapPoint(...Gale.locations.landing);return Gale.coordinates(p.x,p.y)})()',
  );
  assert(Math.abs(landing.latitude + 4.5895) < 1e-10);
  assert(Math.abs(landing.longitude - 137.4417) < 1e-10);
  assert.match(game.element('#terrain-source-status').textContent, /^NASA MOLA crop loaded/);
});

test('Storage errors keep the image fallback usable; failed imports preserve existing terrain', async () => {
  const game = createGame({ storageError: new Error('Storage unavailable') });
  assert.equal(game.evaluate('Gale.measured'), false);
  assert.match(game.element('#nasa-import-status').textContent, /Storage unavailable/);
  const picker = game.element('#nasa-files'),
    status = game.element('#nasa-import-status');
  picker.files = [{ name: 'wrong.txt' }];
  await picker.emit('change');
  assert.match(status.textContent, /^Select/);
  picker.files = [tile(), { name: 'megt00n090hb.lbl', text: async () => label }];
  game.sandbox.localStorage.setItem = () => {
    throw new Error('Storage quota exceeded');
  };
  await picker.emit('change');
  assert.match(status.textContent, /Storage quota exceeded/);
  assert.equal(picker.disabled, false);
  assert.equal(game.reloads, 0);
  assert.equal(game.evaluate('Gale.measured'), false);
});

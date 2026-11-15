'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game.cjs');

test('USGS route DEM uses geographic samples and shared surface heights', () => {
  const game = createGame({ routeTerrain: true });
  const run = game.evaluate;
  assert(run('RouteTerrain.ready'));
  assert(
    run(
      'NASA_TRAVERSE_COORDINATES.every(p=>{const q=Gale.fromCoordinates(p[1],p[0]);return RouteTerrain.contains(q.x,q.y)})',
    ),
  );
  for (const [u, v] of [
    [0.2, 0.2],
    [0.4, 0.5],
    [0.7, 0.8],
  ]) {
    const result = run(
      `(()=>{const d=ROUTE_DEM_DATA,ix=Math.floor(d.columns*${u}),iy=Math.floor(d.rows*${v});const p=Gale.fromCoordinates(d.north+iy*d.latitudeStep,d.west+ix*d.longitudeStep);return [Gale.elevationMeters(p.x,p.y),d.heights[iy*d.columns+ix],Gale.height(p.x,p.y),RouteTerrain.height(p.x,p.y)]})()`,
    );
    assert(Math.abs(result[0] - result[1]) < 1e-6);
    assert.equal(result[2], result[3]);
  }
  assert(
    run(
      '(()=>{const b=RouteTerrain.bounds;return Math.abs(Gale.height(b.minX,b.minY)-Gale.baseHeight(b.minX,b.minY))<1e-6})()',
    ),
  );
  assert(run('Gale.height(0,0)===Gale.baseHeight(0,0)'));
  const sample = run('(()=>{const p=Gale.spawnPoint;return Gale.elevationMeters(p.x,p.y)})()');
  assert(
    sample > -4700 && sample < -4000,
    'Landing elevation is plausible, not nodata or image brightness',
  );
  assert(run('document.querySelector("#terrain-badge").textContent.includes("USGS")'));
});

test('Bundled MOLA background agrees with route elevations and preserves the boundary', () => {
  const game = createGame({ routeTerrain: true, molaBackground: true });
  const run = game.evaluate;
  assert(run('Gale.measured'));
  assert(run('GaleDEM.validateGrid(MOLA_BACKGROUND_DATA)===MOLA_BACKGROUND_DATA'));
  assert(
    run(
      '(()=>{const p=Gale.spawnPoint;return Math.abs(Gale.baseElevationMeters(p.x,p.y)-Gale.elevationMeters(p.x,p.y))<10})()',
    ),
  );
  for (const edge of ['minX', 'maxX']) {
    const difference = run(
      `(()=>{const b=RouteTerrain.bounds,x=b.${edge},y=(b.minY+b.maxY)/2;return Math.abs(Gale.height(x,y)-Gale.baseHeight(x,y))})()`,
    );
    assert(difference < 0.001);
  }
});

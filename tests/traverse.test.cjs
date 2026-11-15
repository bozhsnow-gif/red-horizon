'use strict';
const test = require('node:test');
const path = require('node:path');
const { sourceRoot } = require('./helpers/game.cjs');
test('Registered route preserves scale, travel order, provenance, labels and selection', () => {
  const assert = require('node:assert/strict'),
    fs = require('node:fs'),
    vm = require('node:vm');
  const data = require('../src/traverse-data.js'),
    trace = data.registeredPoints();
  assert.equal(trace[0].latitude, -4.589466996);
  assert.equal(trace[0].longitude, 137.441633);
  const east = data.coordinates(1118 + 394, 333),
    north = data.coordinates(1118, 333 - 394),
    rad = Math.PI / 180;
  assert(
    Math.abs(
      (east.longitude - data.anchor.longitude) *
        rad *
        data.radiusMeters *
        Math.cos(data.anchor.latitude * rad) -
        2000,
    ) < 1e-6,
  );
  assert(Math.abs((north.latitude - data.anchor.latitude) * rad * data.radiusMeters - 2000) < 1e-6);
  const landmarkNames = trace.filter((p) => p.name).map((p) => p.name);
  assert.deepEqual(landmarkNames, [
    'Bradbury Landing',
    'Yellowknife Bay',
    'Darwin',
    'Cooperstown',
    'Kimberley',
    'Pahrump Hills',
    'Marias Pass',
    'Bridger Basin',
    'Gobabeb',
    'Naukluft Plateau',
    'Murray Buttes',
    'Ogunquit Beach',
  ]);
  assert(
    trace.some((p) => p.longitude > trace[0].longitude),
    'Yellowknife excursion must go east',
  );
  assert(trace.at(-1).latitude < trace[0].latitude, 'The main traverse proceeds south');
  assert(trace.length > 300, 'The simplified route retains its bends');
  assert.equal(trace.at(-1).latitude, -4.826023311);
  assert.equal(trace.at(-1).longitude, 137.388886);
  assert(trace.every((p) => p.section === 'nasa-rover-path'));
  for (const s of data.sections) assert(fs.statSync(path.join(sourceRoot, s.image)).size > 100000);
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    ['gale-topography', 'gale', 'traverse-data', 'wind', 'waypoints']
      .map((p) => fs.readFileSync(path.join(sourceRoot, p + '.js'), 'utf8'))
      .join('\n'),
    sandbox,
  );
  const evaluate = (code) => vm.runInContext(code, sandbox);
  const points = JSON.parse(evaluate('JSON.stringify(Gale.climbRoute)'));
  assert.equal(points[0].kind, 'trace');
  assert.equal(points[0].x, evaluate('Gale.spawnPoint.x'));
  assert.equal(points[0].y, evaluate('Gale.spawnPoint.y'));
  assert(points.every((p) => p.kind === 'trace'));
  assert(points.some((p) => p.name === 'Bradbury Landing'));
  assert(points.at(-1).latitude === -4.826023311);
  assert(
    points.every(
      (p, i) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        (!i || p.distanceFromStart > points[i - 1].distanceFromStart),
    ),
  );
  assert(
    points.every(
      (p) =>
        p.x >= 0 &&
        p.y >= 0 &&
        p.x <= evaluate('Gale.widthUnits') &&
        p.y <= evaluate('Gale.heightUnits'),
    ),
  );
  assert.equal(
    points.filter((p) => p.kind === 'trace').length,
    trace.length,
    'Every digitized bend must remain a driving waypoint',
  );
  for (const p of points.filter((p) => p.kind === 'trace')) {
    const coords = JSON.parse(evaluate(`JSON.stringify(Gale.coordinates(${p.x},${p.y}))`));
    assert(
      Math.abs(coords.latitude - p.latitude) < 1e-9 &&
        Math.abs(coords.longitude - p.longitude) < 1e-9,
    );
  }
  // Zoom stays anchored under the cursor; drag shifts the view in map units.
  const autoView = JSON.parse(
    evaluate('JSON.stringify(WaypointRoute.view(Gale,Gale.spawnPoint,0))'),
  );
  evaluate('WaypointRoute.zoom(Gale,Gale.spawnPoint,0,0.5,65,80)');
  const zoomed = JSON.parse(evaluate('JSON.stringify(WaypointRoute.customView)'));
  assert(Math.abs(zoomed.w - autoView.w * 0.5) < 1e-6);
  assert(Math.abs(zoomed.x + zoomed.w * 0.25 - (autoView.x + autoView.w * 0.25)) < 1e-6);
  assert(
    Math.abs(zoomed.y + (zoomed.h * 80) / 235 - (autoView.y + (autoView.h * 80) / 235)) < 1e-6,
  );
  evaluate('WaypointRoute.pan(Gale,Gale.spawnPoint,0,26,0)');
  assert(Math.abs(evaluate('WaypointRoute.customView.x') - (zoomed.x - zoomed.w * 0.1)) < 1e-6);
  evaluate('WaypointRoute.customView=null');
  evaluate('WaypointRoute.mode="route"');
  const view = JSON.parse(evaluate('JSON.stringify(WaypointRoute.view(Gale,Gale.spawnPoint,0))'));
  assert(
    points.every(
      (p) => p.x >= view.x && p.x <= view.x + view.w && p.y >= view.y && p.y <= view.y + view.h,
    ),
  );
  // Exercise background registration without requiring a browser/GPU.
  const calls = [];
  sandbox.Image = class {
    constructor() {
      this.complete = true;
      this.naturalWidth = 1634;
    }
  };
  sandbox.ctx = { drawImage: (...args) => calls.push(args) };
  evaluate(
    'WaypointRoute.mode="nearby";WaypointRoute.drawReference(ctx,Gale,x=>x,y=>y,WaypointRoute.view(Gale,Gale.spawnPoint,0))',
  );
  assert(calls.some((c) => c[0].src.includes('MSL_CTX_ortho_mosaic_6m')));
  assert(calls.some((c) => c[0].src.includes('MSL_Gale_HiRISE-LRGB_78quads')));
  assert(calls.every((c) => c.slice(1).every(Number.isFinite) && c[3] > 0 && c[4] > 0));
  assert.equal(evaluate('Gale.spawnCoordinates.latitude'), -4.589466996);
  assert.equal(evaluate('Gale.spawnCoordinates.longitude'), 137.441633);
  const sites = points.filter((p) => p.landmark);
  assert.equal(sites.length, 12, 'Only real named sites are landmarks, not the trace boundary');
  assert.deepEqual(
    sites.map((p) => p.siteNumber),
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
  assert.equal(new Set(sites.map((p) => p.site.id)).size, 12);
  assert(
    sites.every(
      (p) =>
        p.site.source.startsWith('https://') && p.site.positionAccuracy && p.site.positionSource,
    ),
  );
  assert(sites.every((p) => p.site.positionSource.includes('NASA rover path')));
  const elements = new Map();
  sandbox.document = {
    querySelector: (id) => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    },
  };
  evaluate('WaypointRoute.update(Gale,Gale.spawnPoint,0)');
  assert(elements.get('#climb-status').textContent.includes('Bradbury Landing'));
  assert(elements.get('#route-hud').textContent.includes('Bradbury Landing'));
  const list = elements.get('#waypoint-list').innerHTML;
  assert.equal((list.match(/data-waypoint=/g) || []).length, 12);
  assert(!list.includes('Route checkpoint') && !list.includes('End of unambiguous trace'));
  const bradbury = sites[0];
  evaluate(`WaypointRoute.update(Gale,Gale.spawnPoint,${bradbury.id})`);
  assert(
    elements.get('#climb-status').textContent.includes('Yellowknife Bay'),
    'Passing Bradbury targets the next named site while preserving route bends',
  );
  assert(elements.get('#route-progress').textContent.includes('1 / 12 named stops'));
  const cooperstown = sites.find((p) => p.name === 'Cooperstown');
  evaluate(
    `WaypointRoute.selected=${cooperstown.id - 1};WaypointRoute.update(Gale,Gale.spawnPoint,0)`,
  );
  assert(elements.get('#waypoint-details').textContent.includes('Cooperstown'));
  assert(elements.get('#waypoint-details').textContent.includes('Sol 440'));
  assert(elements.get('#waypoint-details').textContent.includes('Estimated'));
  assert.equal(elements.get('#waypoint-source').href, data.visitSource);
  const painted = [];
  sandbox.ctx = new Proxy(
    { measureText: (t) => ({ width: t.length * 5.5 }), fillText: (t) => painted.push(t) },
    { get: (o, k) => (k in o ? o[k] : () => {}) },
  );
  evaluate('WaypointRoute.mode="route";WaypointRoute.draw(ctx,Gale,{...Gale.spawnPoint,a:0},0)');
  assert(painted.includes('Cooperstown'), 'Selected site name must be drawn on the map');
  const boxes = JSON.parse(evaluate('JSON.stringify(WaypointRoute.mapLabelBoxes)'));
  assert(boxes.length >= 10, 'Overview should label most named stops without overlapping text');
  for (let i = 0; i < boxes.length; i++)
    for (let j = 0; j < i; j++) {
      const a = boxes[i],
        b = boxes[j];
      assert(
        !(
          a.left < b.left + b.width &&
          a.left + a.width > b.left &&
          a.top < b.top + b.height &&
          a.top + a.height > b.top
        ),
      );
    }
  const cb = boxes.find((b) => b.index === cooperstown.id - 1);
  assert.equal(
    evaluate(`WaypointRoute.pick(${cb.left + cb.width / 2},${cb.top + cb.height / 2})`),
    cooperstown.id - 1,
    'Map name label selects its real site',
  );
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Wind = require('../src/wind.js');
const { createGame } = require('./helpers/game.cjs');

test('Wind schedule follows the supplied LTST intervals continuously', () => {
  const expected = [
    [0, 'Overnight'],
    [6, 'Morning'],
    [8, 'Daytime circulation developing'],
    [10, 'Established daytime'],
    [15, 'Evening'],
    [17, 'Wind reversal'],
    [19, 'Nighttime'],
    [23, 'Overnight'],
  ];
  for (const [hour, label] of expected) assert(Wind.phase(hour * 60).startsWith(label));
  for (const stream of Wind.streams) {
    assert.equal(Wind.state(12 * 60, stream).day, 1);
    assert.equal(Wind.state(12 * 60, stream).intensity, 1);
    assert.equal(Wind.state(22 * 60, stream).day, 0);
    assert.equal(Wind.state(3 * 60, stream).day, 0);
    assert(Wind.state(9 * 60, stream).intensity < Wind.state(10 * 60, stream).intensity);
    for (const h of [0, 6, 8, 10, 15, 17, 19, 23, 24]) {
      const a = Wind.state(h * 60 - 0.001, stream),
        b = Wind.state(h * 60 + 0.001, stream);
      assert(Math.abs(a.day - b.day) < 0.001, `direction discontinuity at ${h}`);
      assert(Math.abs(a.intensity - b.intensity) < 0.001, `visibility discontinuity at ${h}`);
    }
  }
  const progress = Wind.streams.map((s) => Wind.state(17 * 60, s).day);
  assert(
    progress[0] < progress[1] && progress[1] < progress[2],
    'streams reverse at staggered times',
  );
});

test('Fixed wind corridors follow regional terrain and the map responds to time controls', async () => {
  const game = createGame({ molaBackground: true });
  for (const stream of Wind.streams.filter((s) => s.id !== 'depression')) {
    for (const corridor of stream.corridors) {
      const elevation = ([lat, lon]) =>
        game.evaluate(
          `(()=>{const p=Gale.fromCoordinates(${lat},${lon});return Gale.elevationMeters(p.x,p.y)})()`,
        );
      assert(
        elevation(corridor.at(-1)) > elevation(corridor[0]),
        `${stream.id} should point uphill`,
      );
    }
  }
  const slider = game.element('#time-slider');
  slider.value = '1080';
  await slider.emit('input');
  assert.equal(game.element('#wind-phase').textContent, 'Wind reversal');
  game.element('#wind-overview').onclick();
  assert.equal(game.evaluate('WaypointRoute.mode'), 'crater');
  assert.equal(game.evaluate('WaypointRoute.showWind'), true);
  game.element('#wind-toggle').onclick();
  assert.equal(game.evaluate('WaypointRoute.showWind'), false);
  assert.deepEqual(Wind.clip({ x: -10, y: 50 }, { x: 20, y: 50 }, 260, 235), [
    { x: 0, y: 50 },
    { x: 20, y: 50 },
  ]);
});

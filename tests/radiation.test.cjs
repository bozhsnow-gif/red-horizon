const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game.cjs');
test('Radiation replay preserves source samples, missing intervals, units and time scale', () => {
  const run = createGame().evaluate;
  assert(run('RADIATION_DATA.approximate && RADIATION_DATA.units === "arbitrary units"'));
  assert(
    run(
      'RADIATION_DATA.segments.every(s=>s.every(p=>RadiationMonitor.sample(p[0]).every((v,i)=>Math.abs(v-p[i+1])<1e-8)))',
    ),
  );
  for (const sol of [0, 9, 28, 30, 34, 57, 60, 61])
    assert.equal(run(`RadiationMonitor.sample(${sol})`), null);
  assert.equal(run('RadiationMonitor.solAt(60)'), 10.25);
  assert.equal(run('RadiationMonitor.solAt(99999)'), 60);
  assert(
    run(
      '(()=>{const a=RadiationMonitor.sample(10),b=RadiationMonitor.sample(10.25),m=RadiationMonitor.sample(10.125);return m.every((v,i)=>Math.abs(v-(a[i]+b[i])/2)<1e-8)})()',
    ),
  );
});
test('Radiation monitor is exclusive to astronaut first-person view and resets with the mission', () => {
  const game = createGame(),
    run = game.evaluate,
    panel = game.element('#radiation-panel');
  run('render()');
  assert.equal(panel.hidden, true);
  run('running=true;firstPerson=true;render()');
  assert.equal(panel.hidden, true);
  run('toggleAstronaut();firstPerson=true;render()');
  assert.equal(panel.hidden, false);
  run('elapsed=120;render()');
  assert.match(game.element('#radiation-sol').textContent, /11.25/);
  run('firstPerson=false;render()');
  assert.equal(panel.hidden, true);
  run('firstPerson=true;freeFlight=true;render()');
  assert.equal(panel.hidden, true);
  run('freeFlight=false;elapsed=(30-9.25)*60;render()');
  assert.equal(game.element('#radiation-plastic').textContent, '—');
  assert.match(game.element('#radiation-status').textContent, /NO SOURCE DATA/);
  run('init();render()');
  assert.equal(panel.hidden, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./helpers/game.cjs');

test('Missing observations use the calibrated baseline and convert Earth days to sols', () => {
  const run = createGame().evaluate;
  run('RadiationHealth.advance(60, (30 - RadiationMonitor.startSol) * 60, true)');
  const dose = (0.67 * 88775.244) / 86400;
  assert(Math.abs(run('RadiationHealth.doseMSv') - dose) < 1e-10);
  assert(Math.abs(run('RadiationHealth.health') - (100 - dose * 0.5)) < 1e-10);
  assert.equal(run('RadiationMonitor.sample(30)'), null);
  assert.equal(run('RadiationHealth.rateAt(10000, true).baseline'), true);
  run('RadiationHealth.reset(); RadiationHealth.advance(60, 10000, true)');
  assert(Math.abs(run('RadiationHealth.doseMSv') - dose) < 1e-10);
});

test('Higher chart exposure causes more health loss; fictional rover shielding halves dose', () => {
  const run = createGame().evaluate;
  const lossAt = (sol, outside) =>
    run(`
    RadiationHealth.reset();
    RadiationHealth.advance(10, (${sol} - RadiationMonitor.startSol) * 60, ${outside});
    100 - RadiationHealth.health;
  `);
  const peak = lossAt(45, true),
    low = lossAt(52, true),
    sheltered = lossAt(45, false);
  assert(peak > low);
  assert(Math.abs(sheltered - peak / 2) < 1e-10);
  assert(peak > 0 && peak < 0.1, 'Exposure causes gradual rather than immediate damage');
});

test('Integrated dose is independent of frame partition, including gaps and the chart end', () => {
  const run = createGame().evaluate;
  run('RadiationHealth.advance(3600, 0, true)');
  const single = run('RadiationHealth.doseMSv');
  run(
    'RadiationHealth.reset(); for (let t = 0; t < 3600; t += 10) RadiationHealth.advance(10, t, true)',
  );
  assert(Math.abs(run('RadiationHealth.doseMSv') - single) < 1e-9);
});

test('Mission ticks accumulate dose across cameras and boarding, but not before start or while hidden', () => {
  const game = createGame(),
    run = game.evaluate;
  run('last=1000; tick(1050)');
  assert.equal(run('RadiationHealth.doseMSv'), 0);
  run('running=true; last=1050; tick(1100)');
  const roverDose = run('RadiationHealth.doseMSv');
  assert(roverDose > 0);
  assert.equal(game.element('#health-panel').hidden, false);
  run('toggleAstronaut(); firstPerson=false; tick(1150)');
  const evaDose = run('RadiationHealth.doseMSv');
  assert(evaDose - roverDose > roverDose * 1.9);
  run('freeFlight=true; tick(1200)');
  assert(run('RadiationHealth.doseMSv') > evaDose);
  const before = run('RadiationHealth.doseMSv');
  run('freeFlight=false; toggleAstronaut(); render()');
  assert.equal(run('RadiationHealth.doseMSv'), before);
  run(
    'document.hidden=true; tick(1300); document.hidden=false; missionIntro.active=true; tick(1400)',
  );
  assert.equal(run('RadiationHealth.doseMSv'), before);
  run('missionIntro.active=false; running=false; tick(1500)');
  assert.equal(run('RadiationHealth.doseMSv'), before);
});

test('Reset clears exposure; low health has an accessible bounded meter', () => {
  const game = createGame(),
    run = game.evaluate;
  run('running=true; RadiationHealth.advance(8000, 0, true); astronautHealth=70; render()');
  assert.equal(game.element('#health-panel').dataset.level, 'caution');
  run('RadiationHealth.advance(20000, 8000, true); astronautHealth=0; render()');
  assert.equal(run('RadiationHealth.health'), 0);
  assert.equal(game.element('#health-panel').dataset.level, 'critical');
  assert.equal(game.element('#health-bar').getAttribute('aria-valuenow'), '0.0');
  assert.equal(game.element('#health-fill').style.width, '0%');
  assert.match(game.element('#health-status').textContent, /CRITICAL/);
  run('resetMission(); render()');
  assert.equal(run('RadiationHealth.health'), 100);
  assert.equal(run('RadiationHealth.doseMSv'), 0);
  assert.equal(game.element('#health-value').textContent, '100.0%');
  assert.equal(game.element('#health-fill').style.width, '100%');
});

test('Invalid or backward elapsed time never adds dose or heals the player', () => {
  const run = createGame().evaluate;
  run('RadiationHealth.advance(60, 0, true)');
  const before = run('RadiationHealth.doseMSv');
  run(
    'RadiationHealth.advance(-1, 0, true); RadiationHealth.advance(Infinity, 0, true); RadiationHealth.advance(1, NaN, true)',
  );
  assert.equal(run('RadiationHealth.doseMSv'), before);
  run('running=true; last=1000; tick(900)');
  assert.equal(run('RadiationHealth.doseMSv'), before);
});

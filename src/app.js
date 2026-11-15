'use strict';

const canvas = document.querySelector('#game'),
  map = document.querySelector('#map'),
  mx = map.getContext('2d');
let graphics = null,
  keys = {},
  running = false,
  last = 0,
  toastTimer,
  firstPerson = false,
  birdsEye = false,
  freeFlight = false,
  orbitYaw = 0,
  orbitPitch = 0,
  orbitZoom = 185,
  uiTimer = 0,
  simulationMode = false,
  climbIndex = 0;
let rover, samples, rocks, dist, elapsed, collected;
let astronaut = null;
let lastForwardTap = -Infinity;
let rockSamples = 0;
let pendingMissionAction = null;
const missionIntro = new MissionIntro({
  onStart() {
    running = false;
    clearInput();
    rover.v = 0;
  },
  onFinish(reason) {
    clearInput();
    rover.v = 0;
    last = performance.now();
    running = true;
    document.querySelector('#start').classList.add('hidden');
    const action = pendingMissionAction;
    pendingMissionAction = null;
    if (action) action();
    focusGame();
    if (reason === 'unavailable') message('INTRO UNAVAILABLE - ROVER READY');
    else if (!action) message('FOLLOW THE GLOWING SAMPLE SIGNALS');
  },
});
// Every UI action that begins a mission passes through the same intro gate.
function startMission(action = null) {
  if (!graphics || missionIntro.active) return;
  if (running || missionIntro.completed) {
    running = true;
    document.querySelector('#start').classList.add('hidden');
    if (action) action();
    focusGame();
    return;
  }
  pendingMissionAction = action;
  missionIntro.start();
}
function clearInput() {
  keys = {};
  lastForwardTap = -Infinity;
  if (astronaut) astronaut.sprinting = false;
  lookDrag = null;
  touchPoints.clear();
  touchCenter = null;
  touchSpan = 0;
  if (graphics?.flight) graphics.flight.velocity = [0, 0, 0];
}
function resetCamera() {
  astronaut = null;
  firstPerson = false;
  birdsEye = false;
  freeFlight = false;
  orbitYaw = 0;
  orbitPitch = 0;
  orbitZoom = 185;
  if (graphics) {
    graphics.eva = null;
    graphics.flight = null;
    graphics.referenceCamera = false;
    graphics.yaw = 0;
    graphics.pitch = 0;
    graphics.zoom = 185;
  }
  document.querySelector('#flight-toggle').textContent = 'LEAVE ROVER';
}
function focusGame() {
  if (!running || missionIntro.active) return;
  const rect = canvas.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  if (rect.top < 0 || rect.bottom > viewportHeight || rect.left < 0 || rect.right > viewportWidth) {
    canvas.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }
  canvas.focus({ preventScroll: true });
}
function rand(n) {
  let x = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return x - Math.floor(x);
}
function init() {
  climbIndex = 0;
  WaypointRoute.selected = -1;
  WaypointRoute.mode = 'nearby';
  WaypointRoute.customView = null;
  clearInput();
  resetCamera();
  uiTimer = 0;
  last = performance.now();
  if (graphics) graphics.resetMotion();
  graphics?.astronautView?.laboratory?.reset();
  let landing = Gale.mapPoint(...Gale.locations.landing),
    spawn = Gale.spawnPoint;
  rover = { x: spawn.x, y: spawn.y, a: Math.PI, v: 0 };
  samples = Gale.observations.map((p, i) => ({
    ...p,
    x: landing.x + p.x - 1200,
    y: landing.y + p.y - 1200,
    id: i,
    got: false,
  }));
  rocks = Array.from({ length: 260 }, (_, i) => {
    let center = Gale.mapPoint(...Object.values(Gale.locations)[i % 3]);
    return {
      x: center.x + (rand(i * 5 + 1) - 0.5) * 2400,
      y: center.y + (rand(i * 5 + 2) - 0.5) * 2400,
      r: 3 + rand(i * 5 + 3) * 18,
      a: rand(i * 5 + 4) * 6.28,
    };
  });
  rocks.push(...LandingReference.rocks(spawn));
  if (graphics) graphics.rockSources = rocks;
  dist = 0;
  elapsed = 0;
  collected = 0;
  rockSamples = 0;
  graphics?.restoreRocks?.();
  document.querySelector('#science-title').textContent = 'Explore five geology stops';
  document.querySelector('#science-text').textContent =
    'Visit the glowing sample signals to read the Curiosity field notes.';
  updateUI();
}
function showLandingReference() {
  init();
  running = true;
  document.querySelector('#start').classList.add('hidden');
  firstPerson = true;
  birdsEye = false;
  freeFlight = false;
  orbitYaw = 0;
  orbitPitch = -0.06;
  orbitZoom = 185;
  rover.a = Math.PI;
  if (graphics) {
    graphics.referenceCamera = true;
    graphics.yaw = 0;
    graphics.pitch = -0.06;
    graphics.zoom = 185;
  }
  document.querySelector('#landing-photo').open = true;
  updateUI();
  render();
  message('LANDING VIEW · 4.5895° S, 137.4416° E · 2 m CAMERA');
}
document.querySelector('#landing-view').onclick = () => startMission(showLandingReference);
document.querySelector('#route-map-mode').onclick = () => {
  let modes = ['nearby', 'route', 'crater'];
  WaypointRoute.mode = modes[(modes.indexOf(WaypointRoute.mode) + 1) % modes.length];
  WaypointRoute.customView = null;
  updateUI();
  drawMap();
};
document.querySelector('#waypoint-list').onclick = (e) => {
  let b = e.target.closest('[data-waypoint]');
  if (!b) return;
  WaypointRoute.selected = Number(b.dataset.waypoint);
  WaypointRoute.mode = 'route';
  WaypointRoute.customView = null;
  updateUI();
  drawMap();
};
function mapPosition(e) {
  const bounds = map.getBoundingClientRect();
  return {
    x: ((e.clientX - bounds.left) / bounds.width) * 260,
    y: ((e.clientY - bounds.top) / bounds.height) * 235,
  };
}
function zoomMap(factor, point = { x: 130, y: 117.5 }) {
  WaypointRoute.zoom(Gale, rover, climbIndex, factor, point.x, point.y);
  drawMap();
}
document.querySelector('#map-zoom-in').onclick = () => zoomMap(0.7);
document.querySelector('#map-zoom-out').onclick = () => zoomMap(1 / 0.7);
document.querySelector('#map-recenter').onclick = () => {
  WaypointRoute.customView = null;
  drawMap();
};
map.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoomMap(e.deltaY < 0 ? 0.8 : 1.25, mapPosition(e));
  },
  { passive: false },
);
let mapDrag = null;
map.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || mapDrag) return;
  const p = mapPosition(e);
  mapDrag = { id: e.pointerId, start: p, last: p, moved: false };
  map.setPointerCapture(e.pointerId);
});
map.addEventListener('pointermove', (e) => {
  if (!mapDrag || mapDrag.id !== e.pointerId) return;
  const p = mapPosition(e);
  if (Math.hypot(p.x - mapDrag.start.x, p.y - mapDrag.start.y) > 3) mapDrag.moved = true;
  if (mapDrag.moved) {
    WaypointRoute.pan(Gale, rover, climbIndex, p.x - mapDrag.last.x, p.y - mapDrag.last.y);
    drawMap();
  }
  mapDrag.last = p;
});
map.addEventListener('pointerup', (e) => {
  if (!mapDrag || mapDrag.id !== e.pointerId) return;
  if (!mapDrag.moved) {
    const p = mapPosition(e),
      i = WaypointRoute.pick(p.x, p.y);
    if (i >= 0) {
      WaypointRoute.selected = i;
      updateUI();
      drawMap();
    }
  }
  mapDrag = null;
});
map.addEventListener('pointercancel', () => {
  mapDrag = null;
});
map.addEventListener('lostpointercapture', () => {
  mapDrag = null;
});
function resize() {
  if (graphics) graphics.resize();
}
window.addEventListener('resize', resize);
function message(s) {
  let el = document.querySelector('#toast');
  el.textContent = s;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
function updateUI() {
  const actor = astronaut || rover;
  document.querySelector('#drive-mode').textContent = simulationMode ? 'SIMULATION' : 'EXPLORATION';
  document.querySelector('#drive-mode').setAttribute('aria-pressed', String(simulationMode));
  document.querySelector('#mode-note').textContent = simulationMode
    ? 'Curiosity speed limit: 0.04 m/s'
    : 'Fast travel - simplified traction';
  let coordinatePoint =
    freeFlight && graphics?.flight
      ? { x: graphics.flight.position[0], y: graphics.flight.position[1] }
      : actor;
  let geo = Gale.coordinates(coordinatePoint.x, coordinatePoint.y);
  document.querySelector('#coordinate-owner').textContent =
    (freeFlight ? 'CAMERA' : astronaut ? 'ASTRONAUT' : 'ROVER') +
    (Gale.measured ? ' · MOLA COORDS' : ' · APPROX. COORDS');
  document.querySelector('#geo-latitude').textContent = Gale.formatLatitude(geo.latitude);
  document.querySelector('#geo-longitude').textContent = Gale.formatLongitude(geo.longitude);
  WaypointRoute.update(Gale, rover, climbIndex);
  document.querySelector('#climb-elevation').textContent =
    Math.round(Gale.elevationMeters(actor.x, actor.y)) +
    (typeof RouteTerrain !== 'undefined' && RouteTerrain.contains(actor.x, actor.y)
      ? ' m - USGS DEM'
      : Gale.measured
        ? ' m - MOLA areoid'
        : ' m - estimated map elevation');
  document.querySelector('#count').textContent = String(collected).padStart(2, '0') + ' / 05';
  document.querySelector('#progress').style.width = collected * 20 + '%';
  document.querySelector('#missionstatus').textContent =
    collected === 5 ? 'SURVEY COMPLETE' : 'SURVEY IN PROGRESS';
  document.querySelector('#speed').textContent = (Math.abs(actor.v) / Gale.unitsPerMeter).toFixed(
    simulationMode ? 3 : 1,
  );
  document.querySelector('#distance').textContent = (dist / Gale.unitsPerMeter).toFixed(1);
  document.querySelector('#heading').textContent = String(
    Math.round(((((actor.a * 180) / Math.PI) % 360) + 360) % 360) % 360,
  ).padStart(3, '0');
  document.querySelector('#surface').textContent = Gale.materialAt(rover.x, rover.y).name;
  document.querySelector('#traction').textContent =
    Math.round((rover.traction || Gale.materialAt(rover.x, rover.y).traction) * 100) + '%';
  document.querySelector('#sol').textContent = String(1 + Math.floor(elapsed / 88775.244)).padStart(
    3,
    '0',
  );
}

function terrain(x, y) {
  return Gale.height(x, y);
}
function render() {
  if (graphics) graphics.eva = astronaut;
  if (graphics)
    graphics.render(
      rover,
      samples,
      firstPerson,
      orbitYaw,
      orbitPitch,
      performance.now(),
      orbitZoom,
      birdsEye,
      freeFlight,
      keys,
      climbIndex,
    );
}
function drawMap() {
  WaypointRoute.draw(mx, Gale, astronaut || rover, climbIndex);
}
WaypointRoute.onTilesChanged = () => {
  if (rover) drawMap();
};

function tick(t) {
  if (missionIntro.active) {
    last = t;
    requestAnimationFrame(tick);
    return;
  }
  let dt = Math.min((t - last) / 1000 || 0, 0.05);
  last = t;
  if (running) {
    elapsed += dt;
    let forward = keys.ArrowUp || keys.w || keys.W,
      back = keys.ArrowDown || keys.s || keys.S,
      left = keys.ArrowLeft || keys.a || keys.A,
      right = keys.ArrowRight || keys.d || keys.D;
    let beforeDrive = { x: rover.x, y: rover.y };
    if (astronaut && !freeFlight)
      stepAstronaut(dt, {
        forward,
        back,
        turnLeft: left,
        turnRight: right,
      });
    if (!freeFlight && !astronaut)
      dist += Gale.step(
        rover,
        { forward, back, left, right },
        dt,
        (x, y) => (graphics ? graphics.surface(x, y) : terrain(x, y)),
        simulationMode,
        rocks.filter((rock) => !rock.got),
      );
    for (const s of samples)
      if (!freeFlight && !astronaut && !s.got && Math.hypot(s.x - rover.x, s.y - rover.y) < 35) {
        s.got = true;
        collected++;
        document.querySelector('#science-title').textContent = s.name;
        document.querySelector('#science-text').textContent = s.text;
        message(
          collected === 5
            ? 'ALL SAMPLES COLLECTED — MISSION COMPLETE'
            : 'SAMPLE ' + String(collected).padStart(2, '0') + ' COLLECTED',
        );
      }
    if (!freeFlight && !astronaut) {
      let reached = WaypointRoute.advance(
        Gale.climbRoute,
        climbIndex,
        beforeDrive,
        rover,
        12 * Gale.unitsPerMeter,
      );
      if (reached !== climbIndex) {
        climbIndex = reached;
        message(
          reached === Gale.climbRoute.length
            ? 'ROUTE COMPLETE'
            : 'WAYPOINT ' + reached + ' REACHED',
        );
        updateUI();
        drawMap();
      }
    }
    uiTimer += dt;
    if (uiTimer > 0.12) {
      updateUI();
      drawMap();
      uiTimer = 0;
    }
  }
  render();
  requestAnimationFrame(tick);
}
// Trackpad pinch is delivered as Ctrl+wheel in Chromium browsers.
function limitLookPitch(p) {
  return Math.max(freeFlight ? -1.45 : -0.55, Math.min(freeFlight ? 1.45 : 0.4, p));
}
function evaSurface(x, y) {
  return graphics ? graphics.surface(x, y) : terrain(x, y);
}
function toggleAstronaut() {
  if (!running || missionIntro.active) return;
  if (astronaut) {
    if (astronaut.pickup || astronaut.airborne) return;
    if (Math.hypot(astronaut.x - rover.x, astronaut.y - rover.y) > 100) {
      message('MOVE CLOSER TO THE ROVER TO BOARD');
      return;
    }
    astronaut = null;
    message('RETURNED TO ROVER');
  } else {
    if (!graphics?.astronautView?.loaded) {
      message(
        graphics?.astronautView?.error
          ? 'ASTRONAUT COULD NOT LOAD · RELOAD TO RETRY'
          : 'ASTRONAUT LOADING · TRY F AGAIN IN A MOMENT',
      );
      return;
    }
    const x = rover.x + Math.cos(rover.a) * 65;
    const y = rover.y + Math.sin(rover.a) * 65;
    astronaut = {
      active: true,
      x,
      y,
      z: evaSurface(x, y),
      a: rover.a,
      v: 0,
      vz: 0,
      airborne: false,
      sprinting: false,
      state: 'Idle',
      pickup: null,
    };
    message('EVA: ARROWS / WASD WALK · DOUBLE-TAP UP RUN · SPACE JUMP · P COLLECT · F BOARD');
  }
  rover.v = 0;
  freeFlight = false;
  firstPerson = false;
  birdsEye = false;
  orbitYaw = 0;
  orbitPitch = 0;
  orbitZoom = astronaut ? 130 : 185;
  clearInput();
  if (graphics) {
    graphics.flight = null;
    graphics.referenceCamera = false;
    graphics.eva = astronaut;
  }
  document.querySelector('#flight-toggle').textContent = astronaut
    ? 'RETURN TO ROVER [F]'
    : 'LEAVE ROVER [F]';
  updateUI();
  focusGame();
}
function pickupNearby() {
  if (!astronaut || freeFlight || astronaut.airborne || astronaut.pickup) return;
  const reach = 2 * Gale.unitsPerMeter;
  const candidates = [
    ...samples.filter((s) => !s.got).map((item) => ({ item, kind: 'sample' })),
    ...rocks
      .map((item, index) => ({ item, index, kind: 'rock' }))
      .filter(({ item }) => !item.got && item.r <= 12),
  ]
    .map((candidate) => ({
      ...candidate,
      distance: Math.hypot(candidate.item.x - astronaut.x, candidate.item.y - astronaut.y),
    }))
    .filter((candidate) => candidate.distance <= reach)
    .sort((a, b) => a.distance - b.distance);
  const target = candidates[0];
  if (!target) {
    message('MOVE WITHIN 2 METRES OF A SAMPLE OR SMALL ROCK');
    return;
  }
  astronaut.a = Math.atan2(target.item.x - astronaut.x, -(target.item.y - astronaut.y));
  astronaut.pickup = { ...target, remaining: 1 };
  astronaut.state = 'Pick Up';
  astronaut.v = 0;
}
function stepAstronaut(dt, input) {
  const actor = astronaut;
  if (actor.pickup) {
    actor.pickup.remaining -= dt;
    actor.state = 'Pick Up';
    actor.v = 0;
    if (actor.pickup.remaining <= 0) {
      const { item, kind, index } = actor.pickup;
      if (!item.got) {
        item.got = true;
        if (kind === 'sample') {
          collected++;
          document.querySelector('#science-title').textContent = item.name;
          document.querySelector('#science-text').textContent = item.text;
          message('GEOLOGY SAMPLE COLLECTED');
        } else {
          rockSamples++;
          graphics?.hideRock?.(index);
          document.querySelector('#science-title').textContent = 'Rock samples: ' + rockSamples;
          document.querySelector('#science-text').textContent =
            'Collected nearby loose rock samples during EVA.';
          message('ROCK COLLECTED · INVENTORY: ' + rockSamples);
        }
      }
      actor.pickup = null;
      actor.state = 'Idle';
    }
    return;
  }
  actor.a += ((input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0)) * dt * 1.8;
  const direction = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const sideways = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const magnitude = Math.hypot(direction, sideways);
  actor.v = magnitude ? (actor.sprinting && direction > 0 ? 6 : 2.8) * Gale.unitsPerMeter : 0;
  const stride = (actor.v * dt) / (magnitude || 1);
  const dx = (Math.sin(actor.a) * direction + Math.cos(actor.a) * sideways) * stride;
  const dy = (-Math.cos(actor.a) * direction + Math.sin(actor.a) * sideways) * stride;
  actor.x = Math.max(0, Math.min(Gale.widthUnits, actor.x + dx));
  actor.y = Math.max(0, Math.min(Gale.heightUnits, actor.y + dy));
  dist += Math.hypot(dx, dy);
  const floor = evaSurface(actor.x, actor.y);
  if (actor.airborne) {
    actor.vz -= 3.71 * Gale.unitsPerMeter * dt;
    actor.z += actor.vz * dt;
    if (actor.z <= floor) {
      actor.z = floor;
      actor.vz = 0;
      actor.airborne = false;
    }
  } else actor.z = floor;
  actor.state = actor.airborne
    ? 'Jump'
    : magnitude
      ? actor.sprinting && direction > 0
        ? 'Run'
        : 'Walk'
      : 'Idle';
}
function toggleFlight() {
  if (!running || missionIntro.active) return;
  if (graphics) graphics.referenceCamera = false;
  freeFlight = !freeFlight;
  rover.v = 0;
  clearInput();
  if (astronaut) {
    astronaut.v = 0;
    if (!astronaut.airborne && !astronaut.pickup) astronaut.state = 'Idle';
  }
  firstPerson = false;
  birdsEye = false;
  orbitZoom = 185;
  if (!freeFlight) {
    orbitPitch = limitLookPitch(orbitPitch);
    if (graphics) graphics.flight = null;
  }
  document.querySelector('#flight-toggle').textContent = astronaut
    ? 'RETURN TO ROVER [F]'
    : 'LEAVE ROVER [F]';
  message(
    freeFlight
      ? 'FREE FLIGHT · WASD MOVE · E UP / Q DOWN · V EXIT'
      : astronaut
        ? 'RETURNED TO ASTRONAUT'
        : 'RETURNED TO ROVER',
  );
  updateUI();
  focusGame();
}
document.querySelector('#flight-toggle').onclick = toggleAstronaut;
function zoomCamera(factor) {
  orbitZoom = Math.max(115, Math.min(birdsEye ? Gale.overviewZoom * 1.5 : 420, orbitZoom * factor));
}
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!running || missionIntro.active) return;
    e.preventDefault();
    let units = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight || 650 : 1;
    if (e.ctrlKey) {
      zoomCamera(Math.exp(Math.max(-0.4, Math.min(0.4, -e.deltaY * units * 0.006))));
      return;
    }
    orbitYaw -= e.deltaX * units * 0.004;
    orbitPitch = limitLookPitch(orbitPitch - e.deltaY * units * 0.003);
  },
  { passive: false },
);
let lookDrag = null,
  touchPoints = new Map(),
  touchCenter = null,
  touchSpan = 0;
function touchPair() {
  let a = [...touchPoints.values()];
  return {
    x: (a[0].x + a[1].x) / 2,
    y: (a[0].y + a[1].y) / 2,
    span: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y),
  };
}
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!running || missionIntro.active) return;
  focusGame();
  if (e.pointerType === 'touch') {
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (touchPoints.size === 2) {
      let p = touchPair();
      touchCenter = p;
      touchSpan = p.span;
    }
  } else if ([0, 1, 2].includes(e.button)) {
    lookDrag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && touchPoints.has(e.pointerId)) {
    touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPoints.size === 2) {
      let p = touchPair();
      if (touchCenter) {
        orbitYaw -= (p.x - touchCenter.x) * 0.006;
        orbitPitch = limitLookPitch(orbitPitch - (p.y - touchCenter.y) * 0.006);
      }
      if (touchSpan > 2 && p.span > 2) zoomCamera(p.span / touchSpan);
      touchSpan = p.span;
      touchCenter = p;
    }
  } else if (lookDrag) {
    orbitYaw -= (e.clientX - lookDrag.x) * 0.006;
    orbitPitch = limitLookPitch(orbitPitch - (e.clientY - lookDrag.y) * 0.006);
    lookDrag = { x: e.clientX, y: e.clientY };
  }
});
function endLook(e) {
  touchPoints.delete(e.pointerId);
  if (touchPoints.size < 2) {
    touchCenter = null;
    touchSpan = 0;
  }
  if (e.pointerType !== 'touch') lookDrag = null;
}
for (let event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(event, endLook);
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInput();
});
document.addEventListener('focusin', (e) => {
  if (isInteractiveTarget(e.target)) clearInput();
});
canvas.addEventListener('dblclick', () => {
  if (!running || missionIntro.active) return;
  orbitYaw = 0;
  orbitPitch = 0;
  orbitZoom = birdsEye ? Gale.overviewZoom : 185;
  message('CAMERA RECENTERED');
});
function travelTo(name) {
  const location = Gale.locations[name];
  if (!location) return;
  const point = name === 'landing' ? Gale.spawnPoint : Gale.mapPoint(...location);
  rover.x = point.x;
  rover.y = point.y;
  rover.v = 0;
  clearInput();
  resetCamera();
  if (graphics) graphics.resetPose();
  running = true;
  document.querySelector('#start').classList.add('hidden');
  updateUI();
  drawMap();
  message(
    name === 'landing'
      ? Gale.measured
        ? 'BRADBURY LANDING COORDINATES'
        : 'ESTIMATED LANDING AREA'
      : name === 'summit'
        ? 'TRAVELLED TO CENTRAL MOUNTAIN'
        : 'SOUTHERN RIM AREA',
  );
}
for (let name of ['landing', 'summit', 'rim'])
  document.querySelector('#travel-' + name).onclick = () => startMission(() => travelTo(name));
document.querySelector('#drive-mode').onclick = () => {
  if (missionIntro.active) return;
  simulationMode = !simulationMode;
  rover.v = 0;
  clearInput();
  updateUI();
  focusGame();
};
document.querySelector('#zoom-in').onclick = () => {
  if (running && !missionIntro.active) {
    zoomCamera(0.85);
    focusGame();
  }
};
document.querySelector('#zoom-out').onclick = () => {
  if (running && !missionIntro.active) {
    zoomCamera(1 / 0.85);
    focusGame();
  }
};
const movementCodes = {
  KeyW: 'w',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  KeyE: 'e',
  KeyQ: 'q',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
};
function movementKey(event) {
  if (movementCodes[event.code]) return movementCodes[event.code];
  const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key;
  return Object.values(movementCodes).includes(key) ? key : null;
}
function isInteractiveTarget(target) {
  return !!(
    target?.isContentEditable ||
    ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY', 'A'].includes(target?.tagName)
  );
}
window.addEventListener('keydown', (e) => {
  if (
    missionIntro.active ||
    !running ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    isInteractiveTarget(e.target)
  )
    return;
  if (e.code === 'KeyG' && !e.repeat) {
    e.preventDefault();
    const lab = graphics?.astronautView?.laboratory;
    if (!lab?.loaded) message('LABORATORY LOADING');
    else message(lab.toggle() ? 'LABORATORY DOORS OPENING' : 'LABORATORY DOORS CLOSING');
    return;
  }
  if (e.code === 'KeyF' && !e.shiftKey) {
    e.preventDefault();
    if (!e.repeat) toggleAstronaut();
    return;
  }
  if (e.code === 'KeyV' && !e.repeat) {
    e.preventDefault();
    toggleFlight();
    return;
  }
  if (e.code === 'KeyP' && !e.repeat) {
    e.preventDefault();
    pickupNearby();
    return;
  }
  if (e.code === 'Space' && astronaut && !freeFlight) {
    e.preventDefault();
    if (!e.repeat && !astronaut.airborne && !astronaut.pickup) {
      astronaut.airborne = true;
      astronaut.vz = 2.7 * Gale.unitsPerMeter;
      astronaut.state = 'Jump';
    }
    return;
  }
  if (e.code === 'Digit2' && e.shiftKey && !e.repeat) {
    if (graphics) graphics.referenceCamera = false;
    e.preventDefault();
    if (freeFlight) toggleFlight();
    birdsEye = !birdsEye;
    orbitZoom = birdsEye ? Gale.overviewZoom : 185;
    firstPerson = false;
    message(birdsEye ? 'BIRDS-EYE CAMERA' : 'ORBIT CAMERA');
    return;
  }
  if (e.code === 'Digit1' && e.shiftKey && !e.repeat) {
    if (graphics) graphics.referenceCamera = false;
    e.preventDefault();
    if (freeFlight) toggleFlight();
    firstPerson = !firstPerson;
    birdsEye = false;
    orbitZoom = 185;
    message(firstPerson ? 'FIRST-PERSON CAMERA' : 'ORBIT CAMERA');
    return;
  }
  const key = movementKey(e);
  if (key) {
    e.preventDefault();
    if (astronaut && key === 'ArrowUp' && !e.repeat && !keys[key]) {
      const now = performance.now();
      astronaut.sprinting = now - lastForwardTap <= 350;
      lastForwardTap = now;
    }
    keys[key] = true;
  }
});
// Key codes remain stable if Shift is released before the movement key.
window.addEventListener('keyup', (e) => {
  const key = movementKey(e);
  if (key) keys[key] = false;
  if (astronaut && key === 'ArrowUp') astronaut.sprinting = false;
});
document.querySelectorAll('[data-key]').forEach((b) => {
  const k = b.dataset.key;
  b.addEventListener('pointerdown', (e) => {
    if (!running || missionIntro.active) return;
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys[k] = true;
  });
  b.addEventListener('pointerup', () => (keys[k] = false));
  b.addEventListener('pointercancel', () => (keys[k] = false));
  b.addEventListener('lostpointercapture', () => (keys[k] = false));
});
document.querySelector('#begin').onclick = () => startMission();
function resetMission() {
  init();
  running = true;
  document.querySelector('#start').classList.add('hidden');
  message('MISSION RESET');
}
document.querySelector('#reset').onclick = () => startMission(resetMission);
init();
drawMap();
try {
  graphics = new MarsRenderer(canvas, ARES4_MESH, rocks, terrain);
  const connectAstronaut = () => {
    if (!graphics.astronautView && window.AstronautView)
      graphics.astronautView = new window.AstronautView(graphics);
  };
  window.addEventListener('astronaut-module-ready', connectAstronaut);
  connectAstronaut();
  resize();
  requestAnimationFrame(tick);
  document.documentElement.dataset.renderer = 'ready';
} catch (e) {
  document.documentElement.dataset.renderer = 'failed';
  document.querySelector('.startbox p').textContent = e.message;
  document.querySelector('#begin').disabled = true;
  console.error(e);
}

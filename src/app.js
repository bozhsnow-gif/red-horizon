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
  lastSpaceTap = -Infinity,
  orbitYaw = 0,
  orbitPitch = 0,
  orbitZoom = 185,
  uiTimer = 0,
  simulationMode = false,
  climbIndex = 0;
let rover, samples, rocks, dist, elapsed, collected;
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
  lastSpaceTap = -Infinity;
  lookDrag = null;
  touchPoints.clear();
  touchCenter = null;
  touchSpan = 0;
  if (graphics?.flight) graphics.flight.velocity = [0, 0, 0];
}
function resetCamera() {
  firstPerson = false;
  birdsEye = false;
  freeFlight = false;
  orbitYaw = 0;
  orbitPitch = 0;
  orbitZoom = 185;
  if (graphics) {
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
  clearInput();
  resetCamera();
  uiTimer = 0;
  last = performance.now();
  if (graphics) graphics.resetMotion();
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
  dist = 0;
  elapsed = 0;
  collected = 0;
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
  message('LANDING VIEW · 4.6° S, 137.4° E · 2 m CAMERA');
}
document.querySelector('#landing-view').onclick = () => startMission(showLandingReference);
document.querySelector('#route-map-mode').onclick = () => {
  let modes = ['nearby', 'route', 'crater'];
  WaypointRoute.mode = modes[(modes.indexOf(WaypointRoute.mode) + 1) % modes.length];
  updateUI();
  drawMap();
};
document.querySelector('#waypoint-list').onclick = (e) => {
  let b = e.target.closest('[data-waypoint]');
  if (!b) return;
  WaypointRoute.selected = Number(b.dataset.waypoint);
  WaypointRoute.mode = 'route';
  updateUI();
  drawMap();
};
map.addEventListener('click', (e) => {
  let b = map.getBoundingClientRect(),
    i = WaypointRoute.pick(
      ((e.clientX - b.left) / b.width) * 260,
      ((e.clientY - b.top) / b.height) * 235,
    );
  if (i >= 0) {
    WaypointRoute.selected = i;
    updateUI();
    drawMap();
  }
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
  document.querySelector('#drive-mode').textContent = simulationMode ? 'SIMULATION' : 'EXPLORATION';
  document.querySelector('#drive-mode').setAttribute('aria-pressed', String(simulationMode));
  document.querySelector('#mode-note').textContent = simulationMode
    ? 'Curiosity speed limit: 0.04 m/s'
    : 'Fast travel - simplified traction';
  let coordinatePoint =
    freeFlight && graphics?.flight
      ? { x: graphics.flight.position[0], y: graphics.flight.position[1] }
      : rover;
  let geo = Gale.coordinates(coordinatePoint.x, coordinatePoint.y);
  document.querySelector('#coordinate-owner').textContent =
    (freeFlight ? 'CAMERA' : 'ROVER') + (Gale.measured ? ' · MOLA COORDS' : ' · APPROX. COORDS');
  document.querySelector('#geo-latitude').textContent = Gale.formatLatitude(geo.latitude);
  document.querySelector('#geo-longitude').textContent = Gale.formatLongitude(geo.longitude);
  WaypointRoute.update(Gale, rover, climbIndex);
  document.querySelector('#climb-elevation').textContent =
    Math.round(Gale.elevationMeters(rover.x, rover.y)) +
    (Gale.measured ? ' m · MOLA areoid' : ' m · estimated map elevation');
  document.querySelector('#count').textContent = String(collected).padStart(2, '0') + ' / 05';
  document.querySelector('#progress').style.width = collected * 20 + '%';
  document.querySelector('#missionstatus').textContent =
    collected === 5 ? 'SURVEY COMPLETE' : 'SURVEY IN PROGRESS';
  document.querySelector('#speed').textContent = (Math.abs(rover.v) / Gale.unitsPerMeter).toFixed(
    simulationMode ? 3 : 1,
  );
  document.querySelector('#distance').textContent = (dist / Gale.unitsPerMeter).toFixed(1);
  document.querySelector('#heading').textContent = String(
    Math.round(((((rover.a * 180) / Math.PI) % 360) + 360) % 360) % 360,
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
  WaypointRoute.draw(mx, Gale, rover, climbIndex);
}

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
    if (!freeFlight)
      dist += Gale.step(
        rover,
        { forward, back, left, right },
        dt,
        (x, y) => (graphics ? graphics.surface(x, y) : terrain(x, y)),
        simulationMode,
        rocks,
      );
    for (const s of samples)
      if (!freeFlight && !s.got && Math.hypot(s.x - rover.x, s.y - rover.y) < 35) {
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
    if (!freeFlight) {
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
function toggleFlight() {
  if (!running || missionIntro.active) return;
  if (graphics) graphics.referenceCamera = false;
  freeFlight = !freeFlight;
  rover.v = 0;
  keys = {};
  lastSpaceTap = -Infinity;
  firstPerson = false;
  birdsEye = false;
  orbitZoom = 185;
  if (!freeFlight) {
    orbitPitch = limitLookPitch(orbitPitch);
    if (graphics) graphics.flight = null;
  }
  document.querySelector('#flight-toggle').textContent = freeFlight
    ? 'RETURN TO ROVER'
    : 'LEAVE ROVER';
  message(freeFlight ? 'FREE FLIGHT · WASD MOVE · E UP / Q DOWN' : 'RETURNED TO ROVER');
  updateUI();
  focusGame();
}
document.querySelector('#flight-toggle').onclick = toggleFlight;
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
  const point = Gale.mapPoint(...location);
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
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) {
      const now = performance.now();
      if (now - lastSpaceTap <= 350) toggleFlight();
      else lastSpaceTap = now;
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
    keys[key] = true;
  }
});
// Key codes remain stable if Shift is released before the movement key.
window.addEventListener('keyup', (e) => {
  const key = movementKey(e);
  if (key) keys[key] = false;
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
  resize();
  requestAnimationFrame(tick);
  document.documentElement.dataset.renderer = 'ready';
} catch (e) {
  document.documentElement.dataset.renderer = 'failed';
  document.querySelector('.startbox p').textContent = e.message;
  document.querySelector('#begin').disabled = true;
  console.error(e);
}

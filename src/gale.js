'use strict';
// Terrain provenance is tracked separately from illustrative rocks and physics.
// Source coordinates are authoritative only when the MOLA dataset is loaded.
const TERRAIN_SCALE = 1;
const Gale = {
  terrainScale: TERRAIN_SCALE,
  spawnCoordinates: { latitude: -4.6, longitude: 137.4 },
  get spawnPoint() {
    return this.fromCoordinates(this.spawnCoordinates.latitude, this.spawnCoordinates.longitude);
  },
  get drivingBounds() {
    return { minX: 30, maxX: this.widthUnits - 30, minY: 30, maxY: this.heightUnits - 30 };
  },
  get measured() {
    return GALE_TOPOGRAPHY.kind === 'mola-megdr';
  },
  get locations() {
    return this.measured
      ? NASA_LANDMARKS
      : { landing: [166, 100], summit: [225, 217], rim: [205, 363] };
  },
  get climbRoute() {
    return WaypointRoute.points(this);
  },
  mapPoint(x, y) {
    let m = GALE_TOPOGRAPHY;
    return {
      x:
        x *
        (this.measured ? m.widthMeters / (m.columns - 1) : m.metersPerSourcePixel) *
        this.unitsPerMeter *
        this.terrainScale,
      y:
        y *
        (this.measured ? m.heightMeters / (m.rows - 1) : m.metersPerSourcePixel) *
        this.unitsPerMeter *
        this.terrainScale,
    };
  },
  get overviewZoom() {
    return (
      Math.max(GALE_TOPOGRAPHY.widthMeters, GALE_TOPOGRAPHY.heightMeters) *
      this.unitsPerMeter *
      this.terrainScale *
      0.52
    );
  },
  get widthUnits() {
    return GALE_TOPOGRAPHY.widthMeters * this.unitsPerMeter * this.terrainScale;
  },
  get heightUnits() {
    return GALE_TOPOGRAPHY.heightMeters * this.unitsPerMeter * this.terrainScale;
  },
  // Native MOLA cell-center coordinates; image fallback remains explicitly approximate.
  get geo() {
    let m = GALE_TOPOGRAPHY;
    return this.measured
      ? {
          anchorPixel: [0, 0],
          latitude: m.geo.north,
          longitude: m.geo.west,
          radiusMeters: m.geo.radiusMeters,
          source: m.source.label,
          approximate: false,
        }
      : {
          anchorPixel: [216, 216],
          latitude: -5.44,
          longitude: 137.7,
          radiusMeters: 3396190,
          source: 'https://planetarynames.wr.usgs.gov/Feature/2071',
          approximate: true,
        };
  },
  get geoScale() {
    let m = GALE_TOPOGRAPHY;
    if (this.measured)
      return [
        (m.geo.longitudeStep * (m.columns - 1)) / this.widthUnits,
        (m.geo.latitudeStep * (m.rows - 1)) / this.heightUnits,
      ];
    let deg = 180 / (Math.PI * this.geo.radiusMeters * this.unitsPerMeter * this.terrainScale);
    return [deg / Math.cos((this.geo.latitude * Math.PI) / 180), -deg];
  },
  coordinates(x, y) {
    let anchor = this.mapPoint(...this.geo.anchorPixel),
      scale = this.geoScale;
    return {
      latitude: this.geo.latitude + (y - anchor.y) * scale[1],
      longitude: this.geo.longitude + (x - anchor.x) * scale[0],
    };
  },
  fromCoordinates(latitude, longitude) {
    let anchor = this.mapPoint(...this.geo.anchorPixel),
      scale = this.geoScale;
    return {
      x: anchor.x + (longitude - this.geo.longitude) / scale[0],
      y: anchor.y + (latitude - this.geo.latitude) / scale[1],
    };
  },
  coordinateGrid() {
    let topLeft = this.coordinates(0, 0),
      bottomRight = this.coordinates(this.widthUnits, this.heightUnits),
      lines = [];
    for (let lat = Math.ceil(bottomRight.latitude * 2) / 2; lat <= topLeft.latitude; lat += 0.5)
      lines.push({
        axis: 'latitude',
        value: lat,
        y: this.fromCoordinates(lat, this.geo.longitude).y,
      });
    for (let lon = Math.ceil(topLeft.longitude * 2) / 2; lon <= bottomRight.longitude; lon += 0.5)
      lines.push({
        axis: 'longitude',
        value: lon,
        x: this.fromCoordinates(this.geo.latitude, lon).x,
      });
    return lines;
  },
  formatLatitude(value) {
    return Math.abs(value).toFixed(this.measured ? 4 : 2) + '° ' + (value < 0 ? 'S' : 'N');
  },
  formatLongitude(value) {
    return Math.abs(value).toFixed(this.measured ? 4 : 2) + '° ' + (value < 0 ? 'W' : 'E');
  },
  unitsPerMeter: 18,
  gravity: 3.71,
  simulationTopSpeed: 0.04,
  explorationSpeedMultiplier: 2.2,
  materials: {
    sand: {
      name: 'Bagnold-style sand',
      traction: 0.48,
      rolling: 1.8,
      color: [0.34, 0.32, 0.285],
      tracks: true,
    },
    gravel: {
      name: 'Unmapped surface · visual gravel',
      traction: 0.76,
      rolling: 1.25,
      color: [0.64, 0.53, 0.43],
      tracks: true,
    },
    mudstone: {
      name: 'Murray-style mudstone',
      traction: 0.96,
      rolling: 1,
      color: [0.73, 0.65, 0.55],
      tracks: false,
    },
    sandstone: {
      name: 'Stimson-style sandstone',
      traction: 0.91,
      rolling: 1.05,
      color: [0.8, 0.64, 0.46],
      tracks: false,
    },
  },
  // Elevation alone cannot identify geological formations or measured traction.
  materialAt(x, y) {
    return this.materials.gravel;
  },
  elevationMeters(x, y) {
    const m = GALE_TOPOGRAPHY,
      gx = Math.max(
        0,
        Math.min(
          m.columns - 1,
          (x / (m.widthMeters * this.unitsPerMeter * this.terrainScale)) * (m.columns - 1),
        ),
      ),
      gy = Math.max(
        0,
        Math.min(
          m.rows - 1,
          (y / (m.heightMeters * this.unitsPerMeter * this.terrainScale)) * (m.rows - 1),
        ),
      ),
      ix = Math.min(m.columns - 2, Math.floor(gx)),
      iy = Math.min(m.rows - 2, Math.floor(gy)),
      u = gx - ix,
      v = gy - iy,
      a = m.heights[iy * m.columns + ix],
      b = m.heights[iy * m.columns + ix + 1],
      c = m.heights[(iy + 1) * m.columns + ix + 1],
      d = m.heights[(iy + 1) * m.columns + ix];
    return u >= v ? a + (b - a) * u + (c - b) * v : a + (c - d) * u + (d - a) * v;
  },
  height(x, y) {
    return (
      (this.elevationMeters(x, y) - GALE_TOPOGRAPHY.minLegend) *
      this.unitsPerMeter *
      this.terrainScale
    );
  },
  observations: [
    {
      x: 1200,
      y: 850,
      name: 'Gravel plain',
      text: 'Curiosity documented varied rocks and sediments on the floor of Gale. This stop represents a gravel-covered plain.',
    },
    {
      x: 1570,
      y: 1050,
      name: 'Bagnold sand',
      text: 'Curiosity studied active, dark sand dunes at Bagnold. Wind shapes modern dunes; loose sand gives this simulation reduced traction.',
    },
    {
      x: 1650,
      y: 1510,
      name: 'Stimson sandstone',
      text: 'Stimson sandstone preserves evidence of ancient dune fields. It represents a different depositional environment from Murray mudstone.',
    },
    {
      x: 1050,
      y: 1660,
      name: 'Layered foothills',
      text: 'Mount Sharp contains layers recording changes in past Martian environments. This educational stop is placed for gameplay; it is not a surveyed outcrop.',
    },
    {
      x: 760,
      y: 1100,
      name: 'Murray mudstone',
      text: 'Fine-grained Murray mudstone provides evidence for ancient lakes in Gale Crater. Tire tracks are suppressed on bare bedrock here.',
    },
  ],
  step(rover, controls, dt, surface, simulation = false, rocks = []) {
    let material = this.materialAt(rover.x, rover.y),
      sa = Math.sin(rover.a),
      ca = Math.cos(rover.a),
      gradX = (surface(rover.x + 2, rover.y) - surface(rover.x - 2, rover.y)) / 4,
      gradY = (surface(rover.x, rover.y + 2) - surface(rover.x, rover.y - 2)) / 4,
      slope = gradX * sa - gradY * ca;
    let throttle = (controls.forward ? 1 : 0) - (controls.back ? 1 : 0),
      traction = Math.max(0.22, material.traction - Math.abs(slope) * 0.3),
      limit = simulation
        ? this.simulationTopSpeed * this.unitsPerMeter
        : 148.2 * this.explorationSpeedMultiplier;
    if (simulation) {
      let target = (throttle * limit * traction) / this.materials.mudstone.traction;
      rover.v += (target - rover.v) * (1 - Math.exp(-3 * dt));
      rover.v = Math.max(-limit, Math.min(limit, rover.v));
    } else {
      rover.v +=
        (throttle > 0 ? 140.4 : throttle < 0 ? -101.4 : 0) *
        this.explorationSpeedMultiplier *
        traction *
        dt;
      rover.v *= Math.exp(-1.386294 * material.rolling * dt);
      if (throttle) rover.v -= slope * this.gravity * this.unitsPerMeter * 0.22 * dt;
      rover.v = Math.max(-70.2 * this.explorationSpeedMultiplier, Math.min(limit, rover.v));
    }
    if (!throttle && Math.abs(rover.v) < 0.015) rover.v = 0;
    if (Math.abs(rover.v) > 0.01)
      rover.a +=
        ((controls.right ? 1 : 0) - (controls.left ? 1 : 0)) *
        1.6 *
        dt *
        Math.min(1, Math.abs(rover.v) / (simulation ? 0.35 : 8)) *
        (rover.v < 0 ? -1 : 1) *
        traction;
    let dx = Math.sin(rover.a) * rover.v * dt,
      dy = -Math.cos(rover.a) * rover.v * dt,
      nx = Math.max(this.drivingBounds.minX, Math.min(this.drivingBounds.maxX, rover.x + dx)),
      ny = Math.max(this.drivingBounds.minY, Math.min(this.drivingBounds.maxY, rover.y + dy));
    for (let r of rocks)
      if (
        r.r > 11 &&
        Math.hypot(nx - r.x, ny - r.y) < r.r + 19 &&
        Math.hypot(nx - r.x, ny - r.y) < Math.hypot(rover.x - r.x, rover.y - r.y)
      ) {
        nx = rover.x;
        ny = rover.y;
        rover.v = 0;
        break;
      }
    let distance = Math.hypot(nx - rover.x, ny - rover.y);
    rover.x = nx;
    rover.y = ny;
    rover.traction = traction;
    rover.slip = throttle ? 1 - traction : 0;
    return distance;
  },
};

// Bradbury Landing: NASA MSL landing reconstruction, 4.5895 S / 137.4417 E.
// Summit is the maximum MOLA cell in the central mountain search region, not a surveyed summit point.
const NASA_LANDMARKS = (() => {
  const m = GALE_TOPOGRAPHY;
  if (m.kind !== 'mola-megdr') return null;
  const at = (lat, lon) => [
    (lon - m.geo.west) / m.geo.longitudeStep,
    (lat - m.geo.north) / m.geo.latitudeStep,
  ];
  let summit = null,
    peak = -Infinity;
  for (let y = 0; y < m.rows; y++)
    for (let x = 0; x < m.columns; x++) {
      const lat = m.geo.north + y * m.geo.latitudeStep,
        lon = m.geo.west + x * m.geo.longitudeStep,
        h = m.heights[y * m.columns + x];
      if (lat >= -5.7 && lat <= -4.8 && lon >= 137.5 && lon <= 138.4 && h > peak) {
        peak = h;
        summit = [x, y];
      }
    }
  if (!summit) throw Error('MOLA crop does not cover Mount Sharp.');
  return { landing: at(-4.5895, 137.4417), summit, rim: at(-6.8, 137.7) };
})();

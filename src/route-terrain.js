'use strict';
// Numeric USGS elevation samples; image brightness is never treated as elevation.
const RouteTerrain = {
  get ready() {
    return (
      typeof ROUTE_DEM_DATA !== 'undefined' &&
      !!ROUTE_DEM_DATA &&
      ROUTE_DEM_DATA.heights?.length === ROUTE_DEM_DATA.columns * ROUTE_DEM_DATA.rows
    );
  },
  sync() {
    if (!this.ready) return;
    if (this.base === GALE_TOPOGRAPHY && this.scale === Gale.terrainScale) return;
    this.base = GALE_TOPOGRAPHY;
    this.scale = Gale.terrainScale;
    const d = ROUTE_DEM_DATA;
    const nw = Gale.fromCoordinates(d.north, d.west);
    const se = Gale.fromCoordinates(
      d.north + (d.rows - 1) * d.latitudeStep,
      d.west + (d.columns - 1) * d.longitudeStep,
    );
    this.extent = { minX: nw.x, minY: nw.y, maxX: se.x, maxY: se.y };
    this.dx = (se.x - nw.x) / (d.columns - 1);
    this.dy = (se.y - nw.y) / (d.rows - 1);
    this.revision = (this.revision || 0) + 1;
  },
  get version() {
    this.sync();
    return this.revision || 0;
  },
  get bounds() {
    this.sync();
    return this.extent;
  },
  get columns() {
    return this.ready ? ROUTE_DEM_DATA.columns : 0;
  },
  get rows() {
    return this.ready ? ROUTE_DEM_DATA.rows : 0;
  },
  get cellSizeX() {
    this.sync();
    return this.dx;
  },
  get cellSizeY() {
    this.sync();
    return this.dy;
  },
  get cellSize() {
    this.sync();
    return Math.max(this.dx, this.dy);
  },
  contains(x, y) {
    if (!this.ready) return false;
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
  },
  vertex(ix, iy) {
    const d = ROUTE_DEM_DATA,
      b = this.bounds;
    const x = b.minX + ix * this.dx,
      y = b.minY + iy * this.dy;
    const raw = d.heights[iy * d.columns + ix];
    const base = () => Gale.baseElevationMeters(x, y);
    if (!Number.isFinite(raw) || raw < -20000) return base();
    // Blend to the surrounding coarse crater only at the dataset perimeter.
    const edge = Math.min(
      ix * this.dx,
      iy * this.dy,
      (d.columns - 1 - ix) * this.dx,
      (d.rows - 1 - iy) * this.dy,
    );
    const t = Math.max(0, Math.min(1, edge / (200 * Gale.unitsPerMeter * Gale.terrainScale)));
    if (t === 1) return raw;
    const weight = t * t * (3 - 2 * t);
    return base() * (1 - weight) + raw * weight;
  },
  elevation(x, y) {
    if (!this.contains(x, y)) return null;
    const b = this.bounds;
    const gx = (x - b.minX) / this.dx,
      gy = (y - b.minY) / this.dy;
    const ix = Math.min(this.columns - 2, Math.floor(gx)),
      iy = Math.min(this.rows - 2, Math.floor(gy));
    const u = gx - ix,
      v = gy - iy;
    const a = this.vertex(ix, iy),
      b0 = this.vertex(ix + 1, iy),
      c = this.vertex(ix + 1, iy + 1),
      d = this.vertex(ix, iy + 1);
    return u >= v ? a + (b0 - a) * u + (c - b0) * v : a + (c - d) * u + (d - a) * v;
  },
  height(x, y) {
    const elevation = this.elevation(x, y);
    return elevation === null
      ? Gale.baseHeight(x, y)
      : (elevation - GALE_TOPOGRAPHY.minLegend) * Gale.unitsPerMeter * Gale.terrainScale;
  },
};

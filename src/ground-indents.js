'use strict';
// Decorative sub-metre relief, not surveyed features or modifications to the source DEM.
const GroundIndents = {
  extent: 108,
  cell(ix, iy) {
    if (ix < -6 || ix >= 6 || iy < -6 || iy >= 6) return null;
    const random = (salt) => {
      const n = Math.sin(ix * 127.1 + iy * 311.7 + salt * 91.3) * 43758.5453;
      return n - Math.floor(n);
    };
    if (random(1) < 0.35) return null;
    const x = (ix + 0.5) * 18 + (random(2) - 0.5) * 6;
    const y = (iy + 0.5) * 18 + (random(3) - 0.5) * 6;
    // Keep the rover spawn and the laboratory footprint undisturbed.
    if (Math.hypot(x, y) < 12 || (Math.abs(x) < 60 && y > -2 && y < 43)) return null;
    return { x, y, radius: 2.4 + random(4) * 1.6, depth: 0.2 + random(5) * 0.25 };
  },
  offset(x, y) {
    const spawn = Gale.spawnPoint,
      units = Gale.unitsPerMeter;
    const px = (x - spawn.x) / units,
      py = (y - spawn.y) / units;
    const dent = this.cell(Math.floor(px / 18), Math.floor(py / 18));
    if (!dent) return 0;
    const d2 = ((px - dent.x) ** 2 + (py - dent.y) ** 2) / dent.radius ** 2;
    return d2 >= 1 ? 0 : -dent.depth * (1 - d2) ** 2 * units;
  },
  bounds() {
    const p = Gale.spawnPoint,
      r = this.extent * Gale.unitsPerMeter;
    return [p.x - r, p.y - r, p.x + r, p.y + r];
  },
};

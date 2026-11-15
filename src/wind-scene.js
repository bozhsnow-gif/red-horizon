'use strict';
// Schematic wind geometry. Particle motion and arrow dimensions are visual aids, not wind speeds.
const WindScene = {
  nearest(g, wind, point, minutes, displayStates) {
    let best = null;
    for (const [index, stream] of wind.streams.entries()) {
      for (const path of stream.corridors)
        for (let i = 1; i < path.length; i++) {
          const a = g.fromCoordinates(...path[i - 1]),
            b = g.fromCoordinates(...path[i]);
          const dx = b.x - a.x,
            dy = b.y - a.y,
            d2 = dx * dx + dy * dy;
          if (!d2) continue;
          const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / d2));
          const distance = Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
          if (!best || distance < best.distance) {
            const state = displayStates?.[index] || wind.state(minutes, stream);
            const angle = Math.atan2(dy, dx) + state.rotation;
            best = {
              distance,
              stream: stream.id,
              direction: [Math.cos(angle), Math.sin(angle)],
              intensity: state.intensity,
            };
          }
        }
    }
    return best;
  },
  build(g, wind, surface, actor, time, minutes, displayStates, overview) {
    const vertices = [];
    const vertex = (p, c, alpha) => vertices.push(p[0], p[1], p[2], c[0], c[1], c[2], alpha);
    const triangle = (a, b, c, color, alpha) => {
      vertex(a, color, alpha);
      vertex(b, color, alpha);
      vertex(c, color, alpha);
    };
    const unit = g.unitsPerMeter;
    if (overview > 0.25) {
      const visibility = Math.min(1, (overview - 0.25) / 0.4);
      for (const [index, stream] of wind.streams.entries()) {
        const state = displayStates?.[index] || wind.state(minutes, stream);
        const color =
          stream.id === 'rim'
            ? [1, 0.25, 0.3]
            : stream.id === 'mountain'
              ? [1, 0.82, 0.2]
              : [0.24, 0.7, 1];
        for (const path of stream.corridors)
          for (let i = 1; i < path.length; i++) {
            const a = g.fromCoordinates(...path[i - 1]),
              b = g.fromCoordinates(...path[i]);
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            if (!length) continue;
            const angle = Math.atan2(b.y - a.y, b.x - a.x) + state.rotation;
            const ux = Math.cos(angle),
              uy = Math.sin(angle),
              vx = -uy,
              vy = ux;
            const size = Math.min(9000 * unit, length * 0.9);
            const x = (a.x + b.x) / 2,
              y = (a.y + b.y) / 2,
              z = surface(x, y) + 4500 * unit;
            const point = (along, across) => [
              x + ux * size * along + vx * size * across,
              y + uy * size * along + vy * size * across,
              z,
            ];
            const opacity = 0.9 * state.intensity * visibility;
            triangle(point(-0.5, -0.085), point(0.12, -0.085), point(0.12, 0.085), color, opacity);
            triangle(point(-0.5, -0.085), point(0.12, 0.085), point(-0.5, 0.085), color, opacity);
            triangle(point(0.05, -0.24), point(0.5, 0), point(0.05, 0.24), color, opacity);
          }
      }
    }
    const close = Math.max(0, 1 - overview * 2);
    const local = this.nearest(g, wind, actor, minutes, displayStates);
    if (close && local && local.distance < 12000 * unit) {
      const [ux, uy] = local.direction,
        vx = -uy,
        vy = ux;
      const fade = close * local.intensity * Math.max(0, 1 - local.distance / (12000 * unit));
      const dust = [0.8, 0.68, 0.55];
      for (let i = 0; i < 18; i++) {
        // Repeating visual drift is deliberately not calibrated as a physical speed.
        const across = (((i * 37) % 97) / 97 - 0.5) * 65 * unit;
        const along = ((((((i * 53) % 113) / 113) * 80 + time * 0.0025) % 80) - 40) * unit;
        const x = actor.x + ux * along + vx * across,
          y = actor.y + uy * along + vy * across;
        if (x < 0 || y < 0 || x > g.widthUnits || y > g.heightUnits) continue;
        const z = surface(x, y) + (0.4 + (i % 4) * 0.32) * unit;
        const l = (2.5 + (i % 5)) * unit,
          h = (0.5 + (i % 3) * 0.2) * unit;
        const a = [x - ux * l, y - uy * l, z],
          b = [x + ux * l, y + uy * l, z];
        const c = [b[0], b[1], z + h],
          d = [a[0], a[1], z + h];
        const opacity = 0.2 * fade;
        triangle(a, b, c, dust, opacity);
        triangle(a, c, d, dust, opacity);
      }
    }
    return new Float32Array(vertices);
  },
};
if (typeof module !== 'undefined') module.exports = WindScene;

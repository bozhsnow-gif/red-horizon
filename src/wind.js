'use strict';
// Conceptual corridors based on NASA PIA16475, not georeferenced model output.
// Coordinates are [latitude, longitude] and run in the illustrated daytime direction.
const GaleWind = {
  source: 'https://science.nasa.gov/resource/mountain-winds-at-gale-crater/',
  streams: [
    {
      id: 'rim',
      name: 'Crater rim',
      color: '#ff5b65',
      delay: 0,
      corridors: [
        [
          [-4.65, 137.2],
          [-4.45, 137.15],
          [-4.25, 137.1],
        ],
        [
          [-5.18, 136.95],
          [-5.14, 136.72],
          [-5.1, 136.5],
        ],
        [
          [-5.1, 138.7],
          [-5.05, 138.9],
        ],
        [
          [-6.18, 137.35],
          [-6.39, 137.24],
          [-6.6, 137.15],
        ],
        [
          [-6.15, 138.2],
          [-6.35, 138.35],
          [-6.53, 138.5],
        ],
      ],
    },
    {
      id: 'mountain',
      name: 'Mount Sharp',
      color: '#ffdc55',
      delay: 0.25,
      corridors: [
        [
          [-4.75, 137.35],
          [-4.9, 137.6],
          [-5.08, 137.8],
        ],
        [
          [-5.13, 138.35],
          [-5.1, 138.1],
          [-5.08, 137.8],
        ],
        [
          [-5.65, 137.8],
          [-5.4, 137.8],
          [-5.08, 137.8],
        ],
      ],
    },
    {
      id: 'depression',
      name: 'Northern depression',
      color: '#6bcaff',
      delay: 0.5,
      corridors: [
        [
          [-4.65, 137.44],
          [-4.68, 137.2],
          [-4.76, 137.02],
        ],
        [
          [-4.65, 137.44],
          [-4.68, 137.7],
          [-4.72, 138.0],
          [-4.82, 138.25],
        ],
      ],
    },
  ],
  smooth(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  },
  state(minutes, stream) {
    const hour = (((minutes % 1440) + 1440) % 1440) / 60;
    const morning = this.smooth(6 + stream.delay, 7.5 + stream.delay, hour);
    const evening = this.smooth(15.5 + stream.delay, 18 + stream.delay, hour);
    const day = hour < 6 ? 0 : hour < 8 ? morning : hour < 15.5 ? 1 : 1 - evening;
    let intensity;
    if (hour < 6) intensity = 0.8;
    else if (hour < 8) intensity = 0.8 - 0.45 * this.smooth(6, 8, hour);
    else if (hour < 10) intensity = 0.35 + 0.65 * this.smooth(8, 10, hour);
    else if (hour < 15) intensity = 1;
    else if (hour < 17) intensity = 1 - 0.45 * this.smooth(15, 17, hour);
    else if (hour < 19) intensity = 0.55 + 0.25 * this.smooth(17, 19, hour);
    else intensity = 0.8;
    return { day, intensity, rotation: Math.PI * (1 - day) };
  },
  phase(minutes) {
    const h = (((minutes % 1440) + 1440) % 1440) / 60;
    return h < 6
      ? 'Overnight downhill circulation'
      : h < 8
        ? 'Morning transition'
        : h < 10
          ? 'Daytime circulation developing'
          : h < 15
            ? 'Established daytime circulation'
            : h < 17
              ? 'Evening transition'
              : h < 19
                ? 'Wind reversal'
                : h < 23
                  ? 'Nighttime downhill circulation'
                  : 'Overnight downhill circulation';
  },
  // Clip each fixed geographic corridor to the viewport before placing arrows.
  clip(a, b, width, height) {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    let lo = 0,
      hi = 1;
    for (const [p, q] of [
      [-dx, a.x],
      [dx, width - a.x],
      [-dy, a.y],
      [dy, height - a.y],
    ]) {
      if (p === 0) {
        if (q < 0) return null;
        continue;
      }
      const t = q / p;
      if (p < 0) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
      if (lo > hi) return null;
    }
    return [
      { x: a.x + lo * dx, y: a.y + lo * dy },
      { x: a.x + hi * dx, y: a.y + hi * dy },
    ];
  },
  draw(ctx, g, px, py, minutes, displayStates = null) {
    for (const [index, stream] of this.streams.entries()) {
      const state = displayStates?.[index] || this.state(minutes, stream);
      ctx.save();
      ctx.globalAlpha = state.intensity;
      ctx.strokeStyle = stream.color;
      ctx.fillStyle = stream.color;
      ctx.lineWidth = 2;
      for (const corridor of stream.corridors) {
        for (let i = 1; i < corridor.length; i++) {
          const a = g.fromCoordinates(...corridor[i - 1]),
            b = g.fromCoordinates(...corridor[i]);
          const visible = this.clip(
            { x: px(a.x), y: py(a.y) },
            { x: px(b.x), y: py(b.y) },
            260,
            235,
          );
          if (!visible) continue;
          const [start, end] = visible,
            dx = end.x - start.x,
            dy = end.y - start.y;
          const length = Math.hypot(dx, dy);
          if (length < 2) continue;
          const angle = Math.atan2(dy, dx) + state.rotation;
          const count = Math.min(8, Math.max(1, Math.floor(length / 24)));
          for (let n = 0; n < count; n++) {
            const t = (n + 0.5) / count,
              x = start.x + dx * t,
              y = start.y + dy * t;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(-6, 0);
            ctx.lineTo(6, 0);
            ctx.moveTo(2, -4);
            ctx.lineTo(6, 0);
            ctx.lineTo(2, 4);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }
  },
};
if (typeof module !== 'undefined') module.exports = GaleWind;

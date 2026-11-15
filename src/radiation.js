'use strict';
const RadiationMonitor = {
  startSol: RADIATION_DATA.segments[0][0][0],
  secondsPerSol: 60,
  history: [],
  // Accelerated historical replay: one chart sol per minute of active mission time.
  solAt(seconds) {
    return Math.min(60, this.startSol + Math.max(0, seconds) / this.secondsPerSol);
  },
  sample(sol) {
    for (const segment of RADIATION_DATA.segments) {
      if (sol < segment[0][0] || sol > segment[segment.length - 1][0]) continue;
      for (let i = 1; i < segment.length; i++) {
        const a = segment[i - 1],
          b = segment[i];
        if (sol > b[0]) continue;
        const t = (sol - a[0]) / (b[0] - a[0]);
        return [1, 2].map((k) =>
          a[k] === null || b[k] === null ? null : a[k] + (b[k] - a[k]) * t,
        );
      }
    }
    return null;
  },
  update(visible, seconds, sheltered = false) {
    const panel = document.querySelector('#radiation-panel');
    panel.hidden = !visible;
    const key = `${Math.floor(seconds * 4)}:${sheltered}`;
    if (this.lastKey === key) return;
    this.lastKey = key;
    const sol = this.solAt(seconds),
      raw = seconds / this.secondsPerSol + this.startSol <= 60 ? this.sample(sol) : null,
      sample = raw?.map(v => v == null ? null : v * (sheltered ? RadiationHealth.habitatExposureFactor : 1));
    if (!this.history.length || this.history[this.history.length - 1].sheltered !== sheltered)
      this.history.push({seconds, sheltered});
    if (!visible) return;
    document.querySelector('#radiation-sol').textContent = 'SOURCE SOL ' + sol.toFixed(2);
    document.querySelector('#radiation-plastic').textContent =
      sample?.[0] != null ? '≈ ' + sample[0].toFixed(1) : '—';
    document.querySelector('#radiation-silicon').textContent =
      sample?.[1] != null ? '≈ ' + sample[1].toFixed(1) : '—';
    document.querySelector('#radiation-status').textContent = sample
      ? (sheltered ? 'HABITAT ESTIMATE · 35% REDUCTION' : 'IMAGE-DERIVED REPLAY · 1 SOL / MIN')
      : 'NO SOURCE DATA AT THIS SOL';
    this.draw(sol, sheltered ? RadiationHealth.habitatExposureFactor : 1);
  },
  drawHistory(seconds) {
    const canvas = document.querySelector('#radiation-chart'), ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, left = 42, right = w - 12, top = 14, bottom = h - 28;
    const x = t => right - (seconds - t) / 120 * (right - left);
    const y = v => bottom - (v - 100) / 130 * (bottom - top);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px monospace';
    for (const v of [100, 140, 180, 220]) {
      ctx.strokeStyle = '#ffffff24'; ctx.beginPath(); ctx.moveTo(left, y(v)); ctx.lineTo(right, y(v)); ctx.stroke();
      ctx.fillStyle = '#c9b6a6'; ctx.fillText(String(v), 8, y(v) + 4);
    }
    ctx.fillStyle = '#c9b6a6'; ctx.fillText('-2 min', left, h - 8); ctx.fillText('NOW', right - 25, h - 8);
    for (const [index, color] of [[0, '#ff7975'], [1, '#dce8ef']]) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
      let connected = false;
      for (const point of this.history) {
        const value = point.sample?.[index];
        if (value == null) { connected = false; continue; }
        if (connected) ctx.lineTo(x(point.seconds), y(value));
        else ctx.moveTo(x(point.seconds), y(value));
        connected = true;
      }
      ctx.stroke();
    }
  },
  draw(sol, factor = 1) {
    const canvas = document.querySelector('#radiation-chart'),
      ctx = canvas.getContext('2d');
    const w = canvas.width,
      h = canvas.height,
      left = 42,
      right = w - 12,
      top = 14,
      bottom = h - 28;
    const x = (s) => left + ((s - 9) / 51) * (right - left),
      y = (v) => bottom - ((v - 100) / 130) * (bottom - top);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px monospace';
    ctx.lineWidth = 1;
    for (const v of [100, 140, 180, 220]) {
      ctx.strokeStyle = '#ffffff24';
      ctx.beginPath();
      ctx.moveTo(left, y(v));
      ctx.lineTo(right, y(v));
      ctx.stroke();
      ctx.fillStyle = '#c9b6a6';
      ctx.fillText(String(v), 8, y(v) + 4);
    }
    for (const s of [10, 20, 30, 40, 50, 60]) {
      ctx.fillStyle = '#c9b6a6';
      ctx.fillText(String(s), x(s) - 8, h - 8);
    }
    ctx.fillStyle = '#ffffff09';
    ctx.fillRect(x(27.5), top, x(34.5) - x(27.5), bottom - top);
    ctx.fillStyle = '#baa697';
    ctx.fillText('GAP', x(28.8), top + 18);
    for (const [index, color] of [
      [1, '#ff7975'],
      [2, '#dce8ef'],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (const segment of RADIATION_DATA.segments) {
        let connected = false;
        ctx.beginPath();
        const points = segment.map(p => [p[0], p[index]]);
        for (const transition of this.history) {
          for (const offset of [0, 2]) {
            const at = this.startSol + (transition.seconds + offset) / this.secondsPerSol;
            if (at > segment[0][0] && at < segment[segment.length - 1][0])
              points.push([at, this.sample(at)?.[index - 1] ?? null]);
          }
        }
        points.sort((a, b) => a[0] - b[0]);
        for (const point of points) {
          if (point[1] === null) {
            connected = false;
            continue;
          }
          const time = (point[0] - this.startSol) * this.secondsPerSol;
          let level = this.history[0]?.sheltered ? RadiationHealth.habitatExposureFactor : 1;
          for (let i = 1; i < this.history.length; i++) {
            const change = this.history[i];
            if (time < change.seconds) break;
            const target = change.sheltered ? RadiationHealth.habitatExposureFactor : 1;
            const blend = Math.min(1, (time - change.seconds) / 2);
            level += (target - level) * blend;
          }
          if (connected) ctx.lineTo(x(point[0]), y(point[1] * level));
          else ctx.moveTo(x(point[0]), y(point[1] * level));
          connected = true;
        }
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#ffd270';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(sol), top);
    ctx.lineTo(x(sol), bottom);
    ctx.stroke();
    const sample = this.sample(sol);
    if (sample)
      sample.forEach((v, i) => {
        if (v === null) return;
        ctx.fillStyle = i ? '#dce8ef' : '#ff7975';
        ctx.beginPath();
        ctx.arc(x(sol), y(v * factor), 3, 0, Math.PI * 2);
        ctx.fill();
      });
  },
};

'use strict';

// The chart supplies relative variations only. This separate gameplay model uses
// NASA's 2012–13 Gale average, not a calibration of the image's arbitrary units.
const RadiationHealth = {
  baselineMSvPerEarthDay: 0.67,
  earthDaysPerSol: 88775.244 / 86400,
  healthPointsPerMSv: 0.5,
  roverExposureFactor: 0.5, // Fictional shielding for play, not measured rover protection.
  doseMSv: 0,
  health: 100,
  chartMean: (() => {
    let area = 0,
      duration = 0;
    for (const segment of RADIATION_DATA.segments)
      for (let i = 1; i < segment.length; i++) {
        const a = segment[i - 1],
          b = segment[i];
        if (a[1] === null || b[1] === null) continue;
        area += ((a[1] + b[1]) / 2) * (b[0] - a[0]);
        duration += b[0] - a[0];
      }
    return duration ? area / duration : 1;
  })(),
  reset() {
    this.doseMSv = 0;
    this.health = 100;
    this.lastKey = null;
  },
  rateAt(seconds, outside) {
    const sol = RadiationMonitor.startSol + Math.max(0, seconds) / RadiationMonitor.secondsPerSol;
    const plastic = RadiationMonitor.sample(sol)?.[0];
    return {
      rate:
        this.baselineMSvPerEarthDay *
        (plastic == null ? 1 : plastic / this.chartMean) *
        (outside ? 1 : this.roverExposureFactor),
      baseline: plastic == null,
    };
  },
  advance(seconds, startSeconds, outside) {
    if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(startSeconds)) return;
    const start =
        RadiationMonitor.startSol + Math.max(0, startSeconds) / RadiationMonitor.secondsPerSol,
      end = start + seconds / RadiationMonitor.secondsPerSol;
    // Integrate each observed linear interval exactly. Missing intervals and time
    // after the chart ends retain baseline exposure, never zero or invented data.
    let weightedSols = end - start;
    for (const segment of RADIATION_DATA.segments) {
      if (end <= segment[0][0] || start >= segment[segment.length - 1][0]) continue;
      for (let i = 1; i < segment.length; i++) {
        const a = segment[i - 1],
          b = segment[i],
          lo = Math.max(start, a[0]),
          hi = Math.min(end, b[0]);
        if (hi <= lo || a[1] === null || b[1] === null) continue;
        const slope = (b[1] - a[1]) / (b[0] - a[0]),
          average = a[1] + slope * ((lo + hi) / 2 - a[0]);
        weightedSols += (hi - lo) * (average / this.chartMean - 1);
      }
    }
    this.doseMSv +=
      weightedSols *
      this.earthDaysPerSol *
      this.baselineMSvPerEarthDay *
      (outside ? 1 : this.roverExposureFactor);
    this.health = Math.max(0, Math.min(100, 100 - this.doseMSv * this.healthPointsPerMSv));
  },
  update(visible, seconds, outside) {
    const panel = document.querySelector('#health-panel');
    panel.hidden = !visible;
    if (!visible) return;
    const key = `${Math.floor(seconds * 4)}:${outside}:${this.health.toFixed(1)}`;
    if (this.lastKey === key) return;
    this.lastKey = key;
    const reading = this.rateAt(seconds, outside),
      level = this.health <= 30 ? 'critical' : this.health <= 70 ? 'caution' : 'normal';
    panel.dataset.level = level;
    document.querySelector('#health-value').textContent = this.health.toFixed(1) + '%';
    const bar = document.querySelector('#health-bar');
    bar.setAttribute('aria-valuenow', this.health.toFixed(1));
    bar.setAttribute('aria-valuetext', this.health.toFixed(1) + ' percent health');
    document.querySelector('#health-fill').style.width = this.health + '%';
    document.querySelector('#health-dose').textContent = this.doseMSv.toFixed(2) + ' mSv';
    document.querySelector('#health-rate').textContent = reading.rate.toFixed(2) + ' mSv/day';
    document.querySelector('#health-exposure').textContent =
      (outside ? 'EVA EXPOSURE' : 'ROVER SHIELDING') + (reading.baseline ? ' · BASELINE' : '');
    document.querySelector('#health-status').textContent =
      this.health === 0
        ? 'DEPLETED'
        : level === 'critical'
          ? 'CRITICAL'
          : level === 'caution'
            ? 'LOW HEALTH'
            : 'STABLE';
  },
};

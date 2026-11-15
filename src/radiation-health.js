'use strict';

// The chart supplies relative variations only. This separate gameplay model uses
// NASA's 2012–13 Gale average, not a calibration of the image's arbitrary units.
const RadiationHealth = {
  baselineMSvPerEarthDay: 0.67,
  earthDaysPerSol: 88775.244 / 86400,
  healthPointsPerMSv: 0.5,
  shelterExposureFactor: 0.2, // Illustrative; not measured shielding.
  roverExposureFactor: 0.5, // Fictional shielding for play, not measured rover protection.
  habitatExposureFactor: 0.65, // Illustrative combined shielding; not a validated Mars prediction.
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
  rateAt(seconds, outside, sheltered = false) {
    const sol = RadiationMonitor.startSol + Math.max(0, seconds) / RadiationMonitor.secondsPerSol;
    const plastic = RadiationMonitor.sample(sol)?.[0];
    return {
      rate:
        this.baselineMSvPerEarthDay *
        (plastic == null ? 1 : plastic / this.chartMean) *
        (sheltered ? this.habitatExposureFactor : outside ? 1 : this.roverExposureFactor),
      baseline: plastic == null,
    };
  },
  advance(seconds, startSeconds, outside, sheltered = false) {
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
      (sheltered ? this.habitatExposureFactor : outside ? 1 : this.roverExposureFactor);
    this.health = Math.max(0, Math.min(100, 100 - this.doseMSv * this.healthPointsPerMSv));
  },
  update(visible, seconds, outside, gameHealth = this.health, sheltered = false) {
    const panel = document.querySelector('#health-panel');
    panel.hidden = !visible;
    if (!visible) return;
    const key = `${Math.floor(seconds * 4)}:${outside}:${sheltered}:${gameHealth.toFixed(1)}:${this.doseMSv.toFixed(3)}`;
    if (this.lastKey === key) return;
    this.lastKey = key;
    const reading = this.rateAt(seconds, outside, sheltered);
    const level = GameplayHealth.level(gameHealth);
    panel.dataset.level = level === 'danger' ? 'critical' : level;
    document.querySelector('#health-value').textContent = gameHealth.toFixed(1) + '%';
    const bar = document.querySelector('#health-bar');
    bar.setAttribute('aria-valuenow', gameHealth.toFixed(1));
    bar.setAttribute('aria-valuetext', gameHealth.toFixed(1) + ' percent simulated health');
    document.querySelector('#health-fill').style.width = gameHealth + '%';
    document.querySelector('#health-dose').textContent = this.doseMSv.toFixed(2) + ' mSv';
    document.querySelector('#health-rate').textContent = reading.rate.toFixed(2) + ' mSv/day';
    document.querySelector('#health-exposure').textContent =
      (sheltered ? 'SHELTER · RECOVERING' : outside ? 'EVA EXPOSURE' : 'ROVER SHIELDING') +
      (reading.baseline ? ' · BASELINE' : '');
    document.querySelector('#health-status').textContent = sheltered
      ? 'SHELTER'
      : level === 'critical'
        ? 'CRITICAL · SEEK SHELTER'
        : level === 'danger'
          ? 'DANGER · SEEK SHELTER'
          : level === 'caution'
            ? 'CAUTION'
            : 'STABLE';
  },
};

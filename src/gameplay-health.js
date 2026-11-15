'use strict';
// Gameplay-only health, not a radiation dose or a medical model.
const GameplayHealth = {
  exposurePerSecond: 0.4,
  recoveryPerSecond: 1,
  advance(health, seconds, sheltered) {
    const change =
      Math.max(0, seconds) * (sheltered ? this.recoveryPerSecond : -this.exposurePerSecond);
    return Math.max(0, Math.min(100, health + change));
  },
  level(health) {
    return health <= 20
      ? 'critical'
      : health <= 45
        ? 'danger'
        : health <= 75
          ? 'caution'
          : 'normal';
  },
};
if (typeof module !== 'undefined') module.exports = GameplayHealth;

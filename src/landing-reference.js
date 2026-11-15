'use strict';
// Visual reference, not a DEM or georeferenced rock survey.
const LandingReference = {
  image: 'landing-reference.jpg',
  latitude: -4.589466996,
  longitude: 137.441633,
  cameraHeightMeters: 2,
  source: 'https://science.nasa.gov/photojournal/gale-crater-vista-in-glorious-color/',
  rocks(center) {
    const out = [],
      random = (n) => {
        let x = Math.sin(n * 127.1 + 71.3) * 43758.5453;
        return x - Math.floor(x);
      };
    for (let i = 0; i < 2100; i++) {
      let angle = random(i * 7 + 1) * Math.PI * 2,
        radius = 3.3 + Math.sqrt(random(i * 7 + 2)) * (i < 1400 ? 25 : 95),
        size = 0.008 + Math.pow(random(i * 7 + 3), 3) * 0.14;
      let tone = random(i * 7 + 4),
        color = [0.3 + tone * 0.12, 0.285 + tone * 0.105, 0.265 + tone * 0.08];
      out.push({
        x: center.x + Math.cos(angle) * radius * 18,
        y: center.y + Math.sin(angle) * radius * 18,
        r: size * 18,
        a: random(i * 7 + 5) * Math.PI * 2,
        lowProfile: true,
        color,
        illustrative: true,
      });
    }
    return out;
  },
};

// Reproducible approximate trace extraction from the user-supplied chart.
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const data = await page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = 'data:image/jpeg;base64,' + encoded;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      const trace = (x, red) => {
        const ys = [];
        for (let px = Math.round(x) - 2; px <= Math.round(x) + 2; px++)
          for (let y = red ? 355 : 575; y < 1115; y++) {
            const i = (y * image.width + px) * 4,
              r = pixels[i],
              g = pixels[i + 1],
              b = pixels[i + 2];
            if (red ? r > 180 && g < 100 && b < 100 : r < 85 && g < 85 && b < 85) ys.push(y);
          }
        if (!ys.length) return null;
        ys.sort((a, b) => a - b);
        return Math.round((160 + (1165 - ys[Math.floor(ys.length / 2)]) / 12.7) * 10) / 10;
      };
      const segments = [];
      for (const [start, end, left] of [
        [9.25, 27.5, true],
        [34.5, 56.5, false],
      ]) {
        const samples = [];
        for (let sol = start; sol <= end; sol += 0.25) {
          const x = left ? 419 + (sol - 10) * 32.4 : 1170 + (sol - 40) * 24.2;
          samples.push([sol, trace(x, true), trace(x, false)]);
        }
        segments.push(samples);
      }
      return {
        units: 'arbitrary units',
        source: 'radiation-reference.jpg',
        approximate: true,
        segments,
      };
    }, fs.readFileSync('src/radiation-reference.jpg').toString('base64'));
    fs.writeFileSync(
      'src/radiation-data.js',
      "'use strict';\n// Image-digitized estimates, not instrument telemetry. Breaks remain missing data.\nconst RADIATION_DATA = " +
        JSON.stringify(data) +
        ';\n',
    );
    console.log(
      'Digitized',
      data.segments.map((s) => s.length),
      'samples',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

'use strict';
(() => {
  const m = GALE_TOPOGRAPHY,
    measured = Gale.measured;
  document.querySelector('#terrain-badge').textContent = measured
    ? 'MARS / NASA MOLA TERRAIN'
    : 'MARS / ESTIMATED TERRAIN';
  document.querySelector('#terrain-extent').textContent =
    (m.widthMeters / 1000).toFixed(1) +
    ' × ' +
    (m.heightMeters / 1000).toFixed(1) +
    ' km at full scale. ' +
    (measured
      ? 'NASA MOLA elevation grid.'
      : 'Image-derived estimate; NASA elevation data not loaded.');
  document.querySelector('#terrain-source-status').textContent = measured
    ? 'NASA MOLA crop loaded: ' + m.product + '.'
    : 'NASA elevation data not loaded. The current landscape is still estimated from your color map.';
  document.querySelector('#terrain-provenance').textContent = measured
    ? 'Native 1/128-degree elevation cells; planetocentric latitude, east-positive longitude, IAU 2000 coordinates, metres above the MOLA areoid. Bradbury Landing travel destination: 4.5895° S, 137.4417° E. The mountain destination is the highest grid sample found in the central mountain region. Georeferencing does not make the coarse terrain rover-scale accurate.'
    : 'Fallback: 217 × 196 heights decoded from map colors (~891 m spacing). Elevation datum and original projection are unknown. Coordinates still use a single approximate crater-center tie point; neither the marked landing area nor mountain destination is survey-accurate.';
  if (terrainStorageError)
    document.querySelector('#nasa-import-status').textContent = terrainStorageError;
  const picker = document.querySelector('#nasa-files'),
    status = document.querySelector('#nasa-import-status');
  picker.addEventListener('change', async () => {
    const files = Array.from(picker.files || []),
      img = files.find((f) => /\.img$/i.test(f.name)),
      label = files.find((f) => /\.lbl$/i.test(f.name));
    if (files.length !== 2 || !img || !label) {
      status.textContent = 'Select the .img and matching .lbl together.';
      return;
    }
    picker.disabled = true;
    status.textContent = 'Validating NASA files and extracting Gale Crater…';
    try {
      if (label.name.toLowerCase() !== GaleDEM.product + '.lbl')
        throw Error('Select the matching ' + GaleDEM.product + '.lbl label.');
      const data = await GaleDEM.importTile(img, await label.text());
      localStorage.setItem(GALE_DATA_KEY, JSON.stringify(data));
      status.textContent = 'NASA terrain saved. Reloading the game…';
      window.location.reload();
    } catch (error) {
      status.textContent =
        'Import failed: ' + error.message + ' Existing terrain has not been changed.';
      picker.disabled = false;
    }
  });
})();

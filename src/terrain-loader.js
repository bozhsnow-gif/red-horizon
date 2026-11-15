'use strict';
// Only parsed numeric data is restored; never evaluate imported scripts.
const GALE_DATA_KEY = 'red-horizon-mola-v1';
let terrainStorageError = '';
try {
  const saved = localStorage.getItem(GALE_DATA_KEY);
  if (saved) GALE_TOPOGRAPHY = GaleDEM.validateGrid(JSON.parse(saved));
} catch (error) {
  terrainStorageError = 'Saved NASA terrain could not be restored: ' + error.message;
}

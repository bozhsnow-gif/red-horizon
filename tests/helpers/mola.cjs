'use strict';
const dem = require('../../src/mola-import.js');
const label = `PDS_VERSION_ID = PDS3
^IMAGE = "MEGT00N090HB.IMG"
DATA_SET_ID = "MGS-M-MOLA-5-MEGDR-L3-V1.0"
INSTRUMENT_ID = MOLA
TARGET_NAME = MARS
LINES = 5632
LINE_SAMPLES = 11520
SAMPLE_TYPE = MSB_INTEGER
SAMPLE_BITS = 16
MAP_RESOLUTION = 128 <PIXEL/DEGREE>
UNIT = METER
MAP_PROJECTION_TYPE = "SIMPLE CYLINDRICAL"
POSITIVE_LONGITUDE_DIRECTION = "EAST"
COORDINATE_SYSTEM_NAME = "PLANETOCENTRIC"
MAXIMUM_LATITUDE = 0 <DEGREE>
MINIMUM_LATITUDE = -44 <DEGREE>
WESTERNMOST_LONGITUDE = 90 <DEGREE>
EASTERNMOST_LONGITUDE = 180 <DEGREE>
A_AXIS_RADIUS = 3396 <KM>
SCALING_FACTOR = 1
OFFSET = 0
END`;
// Synthetic affine surface for independent endian, stride and interpolation checks.
// Never saved as real NASA data or shipped to the game.
function tile({ invalid = false, truncated = false } = {}) {
  return {
    name: 'megt00n090hb.img',
    size: 129761280,
    slice(start, end) {
      return {
        async arrayBuffer() {
          const buffer = new ArrayBuffer(end - start - (truncated ? 2 : 0)),
            view = new DataView(buffer);
          for (let offset = 0; offset < buffer.byteLength; offset += 2) {
            const sample = (start + offset) / 2,
              row = Math.floor(sample / 11520),
              col = sample % 11520;
            view.setInt16(
              offset,
              invalid ? 32767 : -4500 + (row - dem.row0) * 3 + (col - dem.col0) * 2,
              false,
            );
          }
          return buffer;
        },
      };
    },
  };
}
module.exports = { dem, label, tile };

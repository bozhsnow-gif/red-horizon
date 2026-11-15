const fs=require('fs');
function edit(file,fn){if(process.argv.includes('--html-only')&&file!=='index.html')return;const p='dist/'+file,s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,fn(s));}
edit('gale-topography.js',s=>s.replace(/^const GALE_TOPOGRAPHY=/,'let GALE_TOPOGRAPHY='));
edit('gale.js',s=>{
 s=s.replace('const TERRAIN_SCALE=.7;','const TERRAIN_SCALE=1;');
 const a=s.indexOf(' climbRoute:'),b=s.indexOf(' get overviewZoom',a);
 if(a<0||b<0)throw Error('Gale locations not found');
 s=s.slice(0,a)+` get measured(){return GALE_TOPOGRAPHY.kind==='mola-megdr'},
 get locations(){return this.measured?NASA_LANDMARKS:{landing:[166,100],summit:[225,217],rim:[205,363]}},
 get climbRoute(){let a=this.mapPoint(...this.locations.landing),b=this.mapPoint(...this.locations.summit);return Array.from({length:5},(_,i)=>({x:a.x+(b.x-a.x)*i/4,y:a.y+(b.y-a.y)*i/4}))},
 mapPoint(x,y){let m=GALE_TOPOGRAPHY;return {x:x*(this.measured?m.widthMeters/(m.columns-1):m.metersPerSourcePixel)*this.unitsPerMeter*this.terrainScale,y:y*(this.measured?m.heightMeters/(m.rows-1):m.metersPerSourcePixel)*this.unitsPerMeter*this.terrainScale}},
`+s.slice(b);
 const ga=s.indexOf(' // One approximate'),gb=s.indexOf(' coordinates(',ga);
 s=s.slice(0,ga)+` // Native MOLA cell-center coordinates; image fallback remains explicitly approximate.
 get geo(){let m=GALE_TOPOGRAPHY;return this.measured?{anchorPixel:[0,0],latitude:m.geo.north,longitude:m.geo.west,radiusMeters:m.geo.radiusMeters,source:m.source.label,approximate:false}:{anchorPixel:[216,216],latitude:-5.44,longitude:137.70,radiusMeters:3396190,source:'https://planetarynames.wr.usgs.gov/Feature/2071',approximate:true}},
 get geoScale(){let m=GALE_TOPOGRAPHY;if(this.measured)return [m.geo.longitudeStep*(m.columns-1)/this.widthUnits,m.geo.latitudeStep*(m.rows-1)/this.heightUnits];let deg=180/(Math.PI*this.geo.radiusMeters*this.unitsPerMeter*this.terrainScale);return [deg/Math.cos(this.geo.latitude*Math.PI/180),-deg]},
`+s.slice(gb);
 s=s.replaceAll('.toFixed(2)',".toFixed(this.measured?4:2)");
 const ma=s.indexOf(' materialAt('),mb=s.indexOf(' elevationMeters(',ma);
 s=s.slice(0,ma)+` // Elevation alone cannot identify geological formations or measured traction.
 materialAt(x,y){return this.materials.gravel},
`+s.slice(mb);
 s=s.replace("name:'Loose gravel'","name:'Unmapped surface · visual gravel'");
 s=s.replace('This compressed scene illustrates layered foothills, not their measured geometry.','This educational stop is placed for gameplay; it is not a surveyed outcrop.');
 s=s.replace('// Geology is informed by Curiosity observations. Layout, traction coefficients and\r\n// local relief are illustrative gameplay choices, not measured Gale map products.', '// Terrain provenance is tracked separately from illustrative rocks and rover physics.');
 s+=`
// Bradbury Landing: NASA MSL landing reconstruction, 4.5895 S / 137.4417 E.
// Summit is the maximum MOLA cell in the central mountain search region, not a surveyed summit point.
const NASA_LANDMARKS=(()=>{
 const m=GALE_TOPOGRAPHY;if(m.kind!=='mola-megdr')return null;
 const at=(lat,lon)=>[(lon-m.geo.west)/m.geo.longitudeStep,(lat-m.geo.north)/m.geo.latitudeStep];
 let summit=null,peak=-Infinity;
 for(let y=0;y<m.rows;y++)for(let x=0;x<m.columns;x++){
  const lat=m.geo.north+y*m.geo.latitudeStep,lon=m.geo.west+x*m.geo.longitudeStep,h=m.heights[y*m.columns+x];
  if(lat>=-5.7&&lat<=-4.8&&lon>=137.5&&lon<=138.4&&h>peak){peak=h;summit=[x,y]}
 }
 if(!summit)throw Error('MOLA crop does not cover Mount Sharp.');
 return {landing:at(-4.5895,137.4417),summit,rim:at(-6.8,137.7)};
})();
`;
 new Function(s);return s;
});
edit('renderer.js',s=>{
 s=s.replace('uniform vec4 geoOrigin;','uniform vec3 terrainElevation;uniform vec4 geoOrigin;');
 s=s.replace('float elevation=world.z/12.6-4500.;','float elevation=world.z/terrainElevation.x+terrainElevation.y;');
 s=s.replace('(elevation+4500.)/6000.','(elevation-terrainElevation.y)/(terrainElevation.z-terrainElevation.y)');
 s=s.replace("'geoOrigin','geoScale'","'terrainElevation','geoOrigin','geoScale'");
 s=s.replace('gl.uniform1f(this.uniforms.overview,overview);','gl.uniform1f(this.uniforms.overview,overview);gl.uniform3fv(this.uniforms.terrainElevation,new Float32Array([Gale.unitsPerMeter*Gale.terrainScale,GALE_TOPOGRAPHY.minLegend,GALE_TOPOGRAPHY.maxLegend]));');
 s=s.replace('4500*Gale.unitsPerMeter*Gale.terrainScale','(GALE_TOPOGRAPHY.maxLegend-GALE_TOPOGRAPHY.minLegend)*.5*Gale.unitsPerMeter*Gale.terrainScale');
 s=s.replace('// Image-derived terrain at real horizontal and vertical scale (18 units/metre).','// Native grid samples: identical mesh/collision triangles and 18 units per metre.');
 new Function(s);return s;
});
edit('index.html',s=>{
 s=s.replace('<script src="gale-topography.js"></script>','<script src="gale-topography.js"></script><script src="mola-import.js"></script><script src="terrain-loader.js"></script>');
 s=s.replace('MARS / IMAGE-DERIVED HEIGHTS','<span id="terrain-badge">MARS / ESTIMATED TERRAIN</span>');
 s=s.replace('02 / Calibrated topography','02 / Terrain &amp; coordinates');
 s=s.replace('Explore Gale at 70% of the dimensions estimated from your topographic map.','Explore Gale at full physical scale. Load NASA MOLA terrain below to replace the estimated map.');
 s=s.replace('Approx. 135 × 122 km of terrain, scaled to 70% of the reference map.','<span id="terrain-extent">Full-scale terrain; source pending.</span>');
 s=s.replace('Mount Sharp climb','Mountain exploration');
 s=s.replace('Follow the gold beacons from the marked basin to the central mountain. Even at 70% scale this route spans many kilometres; instant travel is available below.','Gold beacons are fictional exploration waypoints, not Curiosity’s recorded traverse or a verified safe route. Use instant travel for long distances.');
 s=s.replace('>BASIN</button>','>LANDING AREA</button>').replace('>CRATER RIM</button>','>SOUTHERN RIM AREA</button>');
 s=s.replace('>SIMULATION</button>','>SIMULATION</button>');
 s=s.replace('aria-pressed="false">EXPLORATION','aria-pressed="true">SIMULATION');
 s=s.replace('Fast travel · simplified traction</p>','Curiosity speed limit: 0.04 m/s · simplified traction</p>');
 s=s.replace('simulationMode=false','simulationMode=true');
 s=s.replace("elapsed/88775","elapsed/88775.244");
 s=s.replace("freeFlight?'CAMERA · APPROX. COORDS':'ROVER · APPROX. COORDS'","(freeFlight?'CAMERA':'ROVER')+(Gale.measured?' · MOLA COORDS':' · APPROX. COORDS')");
 s=s.replace("+' m · map legend elevation'","+(Gale.measured?' m · MOLA areoid':' m · estimated map elevation')");
 s=s.replace('(h+4500)/6000','(h-m.minLegend)/(m.maxLegend-m.minLegend)');
 s=s.replace("'TRAVELLED TO MARKED BASIN'","(Gale.measured?'BRADBURY LANDING COORDINATES':'ESTIMATED LANDING AREA')").replace("'TRAVELLED TO CRATER RIM'","'SOUTHERN RIM AREA'");
 const a=s.indexOf('<details><summary'),b=s.indexOf('</details>',a);
 if(a<0||b<0)throw Error('Sources panel missing');
 s=s.slice(0,a)+`<details open><summary style="cursor:pointer;font-size:12px">NASA terrain &amp; accuracy</summary>
<p id="terrain-source-status" role="status" style="margin-top:12px"></p>
<p>To replace the estimated landscape, download both original NASA files, then select them together. The game reads only the Gale region and stores it in this browser.</p>
<p><a href="https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg128/megt00n090hb.img" target="_blank" rel="noopener">Download MOLA terrain (.img, 130 MB)</a><br><a href="https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg128/megt00n090hb.lbl" target="_blank" rel="noopener">Download matching label (.lbl)</a></p>
<label for="nasa-files" class="small">Load the NASA .img and .lbl files</label><input id="nasa-files" type="file" accept=".img,.lbl" multiple style="width:100%;margin:10px 0;font-size:11px"><p id="nasa-import-status" role="status" aria-live="polite"></p>
<p id="terrain-provenance"></p>
<p>Horizontal and vertical scale: 1:1, with no height exaggeration. The flat local map has small projection distortion and omits planetary curvature. MOLA’s approximately 460 m grid includes interpolated cells; it cannot resolve individual rocks, dunes or wheel-scale hazards. Enhanced overview shading is for readability.</p>
<p>ARES is a fictional four-wheel rover, not Curiosity. Rocks, ground colors, science stops, traction, suspension and exploration waypoints are illustrative. A formation cannot be identified from elevation alone. Simulation speed is capped at 0.04 m/s; exploration mode is accelerated. Gravity: 3.71 m/s². No live Mars weather is simulated.</p>
<p><a href="https://pds-geosciences.wustl.edu/missions/mgs/megdr.html" target="_blank" rel="noopener">NASA PDS: MOLA data and reference surface</a><br><a href="https://ntrs.nasa.gov/api/citations/20130010129/downloads/20130010129.pdf" target="_blank" rel="noopener">NASA: Bradbury Landing coordinates</a><br><a href="https://science.nasa.gov/resource/curiosity-cradled-by-gale-crater/" target="_blank" rel="noopener">NASA: Gale Crater and Mount Sharp</a><br><a href="https://www.jpl.nasa.gov/videos/building-curiosity-rover-rocks-rocker-bogie/" target="_blank" rel="noopener">JPL: rover speed</a><br><a href="https://science.nasa.gov/blog/recap-of-the-bagnold-dune-investigation/" target="_blank" rel="noopener">NASA: Curiosity geology</a></p>
</details>`+s.slice(b+10);
 s=s.replace('</body>','<script src="nasa-ui.js"></script></body>');
 new Function(s.match(/<script>\n([\s\S]*?)<\/script>/)[1]);return s;
});
console.log('Updated physical scale, conditional NASA coordinates, terrain labels, importer UI, shader datum, and unmapped geology.');

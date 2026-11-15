const fs=require('fs');let p='dist/renderer.js',s=fs.readFileSync(p,'utf8');s=s.replace('Math.round(heading%360).toString()', '(Math.round(heading)%360).toString()');fs.writeFileSync(p,s);
p='verify-topography.cjs';s=fs.readFileSync(p,'utf8').replace('style:{},','style:{setProperty(k,v){this[k]=v}},');fs.writeFileSync(p,s);

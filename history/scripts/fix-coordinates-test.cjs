const fs=require('fs');let p='verify-topography.cjs',s=fs.readFileSync(p,'utf8');s=s.replace('const g=Gale,m=GALE_TOPOGRAPHY,origin=', 'const g=Gale,origin=');fs.writeFileSync(p,s);

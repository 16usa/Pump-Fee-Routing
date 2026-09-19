import fs from 'node:fs';
const required=['server.js','server/api.js','server/db.js','server/solana.js','src/app.js','src/styles.css','index.html','.env.example','runtime.config.json'];
let ok=true;for(const f of required){if(!fs.existsSync(f)){console.error('Missing',f);ok=false;}}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));if(!pkg.scripts?.start){console.error('Missing start script');ok=false;}
if(!ok)process.exit(1);console.log('Project structure OK');

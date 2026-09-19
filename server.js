import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './server/config.js';
import { migrate, seedIfEmpty } from './server/db.js';
import { handleApi } from './server/api.js';
import { startWorkers } from './server/workers.js';

migrate(); seedIfEmpty(); startWorkers();
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};
function serve(res,filepath){ if(!fs.existsSync(filepath)||!fs.statSync(filepath).isFile())return false; res.writeHead(200,{'content-type':types[path.extname(filepath)]||'application/octet-stream','cache-control':path.extname(filepath)==='.html'?'no-store':'public, max-age=60'}); fs.createReadStream(filepath).pipe(res); return true; }
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(url.pathname.startsWith('/api/')) return handleApi(req,res,url);
  const clean=decodeURIComponent(url.pathname).replace(/\.\./g,'');
  if(clean.startsWith('/src/')) { const p=path.join(root,clean); if(serve(res,p))return; }
  if(clean!=='/' && serve(res,path.join(root,'public',clean)))return;
  return serve(res,path.join(root,'index.html')) || (res.writeHead(404),res.end('Not found'));
});
server.listen(config.port,'0.0.0.0',()=>console.log(`[${config.appName}] http://0.0.0.0:${config.port} | liveChain=${config.liveChainTransactions} | payout=${config.payoutProvider}`));

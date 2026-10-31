/**
 * Local-only R0E research lab. Never serves a remote network interface, never
 * writes sessions, serves only allowlisted HTML, JS, WASM and model assets.
 *
 * From repository root:
 * npm install --no-save --package-lock=false @markusstrasser/pitchplease@3.1.0
 * node scripts/serve-local-microphone-lab.mjs
 * Open http://127.0.0.1:4318 manually, using a recent Chromium.
 */
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const scripts=join(root,'scripts');
const packageRoot=join(root,'node_modules','@markusstrasser','pitchplease');
const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm',
  '.bin':'application/octet-stream','.json':'application/json; charset=utf-8'};
const routes=new Map([
  ['/',join(scripts,'local-microphone-lab.html')],
  ['/local-microphone-lab.mjs',join(scripts,'local-microphone-lab.mjs')],
  ['/tracker.mjs',join(scripts,'streaming-attack-tracker.mjs')],
  ['/report.mjs',join(scripts,'local-microphone-report.mjs')],
  ['/pitchplease.js',join(packageRoot,'pitchplease.js')]
]);
const CSP=[
  "default-src 'none'","script-src 'self'","style-src 'self'",
  "connect-src 'self'","worker-src 'self' blob:","img-src 'none'",
  "media-src 'self' blob:","object-src 'none'","frame-src 'none'",
  "base-uri 'none'","form-action 'none'"
].join('; ');
const header={
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Permissions-Policy':'microphone=(self), camera=(), geolocation=()',
  'Content-Security-Policy':CSP,'Referrer-Policy':'no-referrer',
  'Cross-Origin-Resource-Policy':'same-origin'
};
export async function resolveLabAsset(pathname) {
  if(typeof pathname!=='string'||pathname.includes('%')||pathname.includes('\\'))return null;
  if(routes.has(pathname))return routes.get(pathname);
  // PitchPlease's worklet, kernels and model weights live under its own
  // pinned package. No arbitrary user-controlled file path is accepted.
  const match=/^\/(engine|models)\/([A-Za-z0-9_.-]+)$/.exec(pathname);
  if(!match)return null;
  const path=join(packageRoot,match[1],match[2]);
  const actual=await realpath(path).catch(()=>null);
  if(!actual||!actual.startsWith(packageRoot+sep))return null;
  return actual;
}
export async function createLabServer({port=4318}={}){
  if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('Invalid localhost port');
  const meta=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8').catch(()=>{
    throw Error('Install @markusstrasser/pitchplease@3.1.0 as a local research-only dependency');
  }));
  if(meta.version!=='3.1.0')throw Error('Research lab requires pinned PitchPlease 3.1.0');
  const server=createServer(async(req,res)=>{
    const requested=(req.url||'/').split('?')[0];
    if(req.method!=='GET'||requested.length>120){
      res.writeHead(405,header);res.end('Only allowed local GET requests');return;
    }
    try{
      const path=await resolveLabAsset(requested);
      if(!path){res.writeHead(404,header);res.end('Not found');return;}
      const bytes=await readFile(path);
      const mime=type[extname(path)]||'application/octet-stream';
      res.writeHead(200,{...header,'Content-Type':mime});
      res.end(bytes);
    }catch(error){
      res.writeHead(500,header);res.end('Asset could not be loaded');
      console.error('Local research asset failed: '+(error?.message||error));
    }
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done);});
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const port=process.env.NOTARE_MIC_LAB_PORT===undefined
      ?4318:Number(process.env.NOTARE_MIC_LAB_PORT);
    const server=await createLabServer({port});
    console.log('Nota-Re R0E local-only microphone lab: http://127.0.0.1:'+
      server.address().port+'/ (research only; no audio stored)');
    for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>server.close(()=>process.exit(0)));
  }catch(error){console.error(error.message);process.exitCode=1;}
}

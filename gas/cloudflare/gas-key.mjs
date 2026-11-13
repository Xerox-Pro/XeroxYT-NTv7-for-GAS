import {timingSafeEqual} from 'node:crypto';

async function matches(provided,expected){
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([provided,expected].map(value=>crypto.subtle.digest('SHA-256',encoder.encode(value))));
 return timingSafeEqual(new Uint8Array(a),new Uint8Array(b));
}

// Add a GAS-only credential without rotating the deployed site's signing key.
// Upload this module beside the original Worker and make entry.mjs the entrypoint:
// import worker from './worker.mjs'; import {withGasKey} from './gas-key.mjs';
// export default withGasKey(worker);
export function withGasKey(worker){
 return {...worker,async fetch(request,env,ctx){
  const supplied=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(typeof env.GAS_API_SHARED_SECRET==='string'&&env.GAS_API_SHARED_SECRET&&await matches(supplied,env.GAS_API_SHARED_SECRET)){
   const origin=String(env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).find(value=>/^https:\/\/[^/]+$/.test(value));
   if(request.headers.get('Origin')!=='https://script.google.com'||!origin||!env.API_SHARED_SECRET){
    return Response.json({error:'GAS access is not configured.'},{status:403});
   }
   const headers=new Headers(request.headers);
   headers.set('Authorization','Bearer '+env.API_SHARED_SECRET);
   headers.set('Origin',origin);
   request=new Request(request,{headers});
  }
  return worker.fetch(request,env,ctx);
 }};
}

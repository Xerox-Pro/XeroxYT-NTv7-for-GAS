import {createRpcTransport} from './transport.mjs';
const SESSION_KEY='xerox_gas_bridge_session_v1';
export function sessionToken(storage=localStorage,random=crypto,cookies=globalThis.document){
 let token;try{token=storage.getItem(SESSION_KEY);}catch{}
 if(!/^[a-f0-9]{64}$/.test(token||'')){
  try{token=/(?:^|;\s*)__Host-xy_gas_device=([a-f0-9]{64})(?:;|$)/.exec(cookies?.cookie||'')?.[1];}catch{}
 }
 if(!/^[a-f0-9]{64}$/.test(token||''))token=Array.from(random.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 try{storage.setItem(SESSION_KEY,token);}catch{}
 try{if(cookies)cookies.cookie='__Host-xy_gas_device='+token+'; Path=/; Secure; SameSite=None; Partitioned; Max-Age=31536000';}catch{}
 return token;
}
export function rpcRequest(request,signal,run=globalThis.google?.script?.run){
 if(signal?.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fn,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);fn(value);};
  const abort=()=>finish(reject,signal.reason||new DOMException('Aborted','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  if(!run){finish(reject,new Error('GASの公開URLから開いてください。'));return;}
  run.withSuccessHandler(value=>finish(resolve,value)).withFailureHandler(()=>finish(reject,new Error('GASへの通信に失敗しました。時間を置いて再試行してください。'))).gasRequest(request);
 });
}
export function shouldBundleSidecar(path,method){
 // Only user-facing YouTube data reads. Account/auth and social RPCs stay untouched.
 return method==='GET'&&/^\/api\/(?:recommendations|trending|search|suggestions|video|channel|channels|home|mix|shorts|shorts-ranking|user|playlists|playlist|sync)(?:[/?]|$)/.test(path);
}
export function installBridge(){
 const nativeFetch=window.fetch.bind(window),token=sessionToken();
 const dispatch=createRpcTransport(request=>rpcRequest(request));
 window.fetch=async(input,options={})=>{
  const raw=input instanceof Request?input.url:String(input);
  const url=new URL(raw,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  const request=new Request(url,input instanceof Request?input:undefined);
  const method=(options.method||request.method||'GET').toUpperCase();
  const signal=options.signal||request.signal;
  const headers=Object.fromEntries(new Headers(options.headers||request.headers));
  let body=options.body;
  if(body===undefined&&!['GET','HEAD'].includes(method))body=await request.text();
  if(body!=null&&typeof body!=='string')throw new Error('GAS版ではJSON形式で送信してください。');
  if(!['GET','HEAD'].includes(method)){if(!headers['content-type'])headers['content-type']='application/json';if(!body)body='{}';}
  window.__XEROX_GAS_RPC_RUNNING__=(window.__XEROX_GAS_RPC_RUNNING__||0)+1;
  // Only normal data requests can piggyback state; no background timer.
  const sidecar=shouldBundleSidecar(url.pathname,method);
  let result;try{result=await dispatch({session:token,path:url.pathname+url.search,method,headers,body:body??null,sidecar},signal);}finally{window.__XEROX_GAS_RPC_RUNNING__=Math.max(0,(window.__XEROX_GAS_RPC_RUNNING__||1)-1);}
  if(result?.sidecar)window.dispatchEvent(new CustomEvent('xerox-gas-sidecar',{detail:result.sidecar}));
  if(!result||!Number.isInteger(result.status))throw new Error('GASからの応答が不正です。');
  if(result.status===403||result.status===429){try{const data=JSON.parse(result.body);if(data.code==='ACCOUNT_BANNED')window.dispatchEvent(new CustomEvent('xerox-account-banned'));if(data.code==='ACCOUNT_TIMEOUT')window.dispatchEvent(new CustomEvent('xerox-account-timeout',{detail:data}));}catch{}}
  return new Response([204,205,304].includes(result.status)?null:result.body,{status:result.status,headers:result.headers});
 };
}

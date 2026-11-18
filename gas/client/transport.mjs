function cancelled(signal){return signal?.reason||new DOMException('Aborted','AbortError');}
function lifetime(path){
 if(/^\/api\/shorts\/[^/?]+\?/.test(path))return 60000;
 if(/^\/api\/shorts-ranking(?:\?|$)/.test(path))return 30000;
 if(/^\/api\/suggestions\?/.test(path))return 10000;
 return 0;
}
function priority(path){
 return /^\/api\/(?:shorts\/|shorts-ranking|channels\/batch)/.test(path)?1:0;
}

// Aborting a caller cannot cancel a GAS server execution. Keep its slot occupied
// until the real callback arrives; other callers can share the same GET result.
export function createRpcTransport(send,{now=Date.now,maxRunning=6}={}){
 const pending=[],inflight=new Map(),cache=new Map();let running=0,epoch=0;
 function drain(){
  pending.sort((a,b)=>a.priority-b.priority);
  while(running<maxRunning&&pending.length){
   const task=pending.shift();running++;
   Promise.resolve().then(()=>{
    if(!task.entry.consumers)throw cancelled();
    return send(task.request);
   }).then(task.resolve,task.reject).finally(()=>{running--;drain();});
  }
 }
 return function dispatch(request,signal){
  if(signal?.aborted)return Promise.reject(cancelled(signal));
  if(request.method!=='GET'){epoch++;cache.clear();}
  const ttl=request.method==='GET'&&!request.sidecar?lifetime(request.path):0;
  const key=request.method==='GET'?JSON.stringify([epoch,request.session,request.path,request.headers,request.sidecar===true]):null;
  const saved=key&&cache.get(key);
  if(saved&&saved.expires>now())return Promise.resolve(saved.value);
  let entry=key&&inflight.get(key);
  if(!entry){
   if(pending.length>=40)return Promise.reject(new Error('通信が集中しています。少し待ってください。'));
   entry={consumers:0};const currentEpoch=epoch;
   entry.promise=new Promise((resolve,reject)=>pending.push({request,entry,priority:priority(request.path),resolve,reject})).then(value=>{
    if(ttl&&epoch===currentEpoch&&value.status===200){
     if(cache.size>=80)cache.delete(cache.keys().next().value);
     cache.set(key,{value,expires:now()+ttl});
    }
    return value;
   }).finally(()=>{if(key&&inflight.get(key)===entry)inflight.delete(key);});
   if(key)inflight.set(key,entry);
  }
  entry.consumers++;
  const result=new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(fn,value)=>{if(settled)return;settled=true;entry.consumers--;signal?.removeEventListener('abort',abort);fn(value);};
   const abort=()=>finish(reject,cancelled(signal));
   signal?.addEventListener('abort',abort,{once:true});
   entry.promise.then(value=>finish(resolve,value),error=>finish(reject,error));
  });
  drain();return result;
 };
}

export function validRelease(value){
 if(!value||typeof value.version!=='string'||value.version.length>250)return false;
 return /^https:\/\/cdn\.jsdelivr\.net\/gh\/[\w.-]+\/[\w.-]+@[a-f0-9]{40}\/gas\/web$/.test(value.base)&&new RegExp('^'+value.base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/app-[\\w-]+\\.js$').test(value.js)&&new RegExp('^'+value.base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/[\\w-]+\\.css$').test(value.css);
}

export function installAutoUpdate(win=window,doc=document){
 let disposed=false,busy=false,lastCheck=0,failedVersion='',failedAt=0,attemptedVersion='',retryTimer=0,lastError='';
 let deviceId=win.__XEROX_RELEASE_DEVICE__;
 try{deviceId=deviceId||win.localStorage.getItem('xerox_release_device_v1');}catch{}
 if(!/^[a-f0-9]{64}$/.test(deviceId||''))deviceId=Array.from(win.crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 win.__XEROX_RELEASE_DEVICE__=deviceId;try{win.localStorage.setItem('xerox_release_device_v1',deviceId);}catch{}
 const config=()=>win.__XEROX_GAS_ASSETS__;
 const retry=()=>{win.clearTimeout(retryTimer);retryTimer=win.setTimeout(()=>void check(true),4000);};
 const apply=async next=>{
  const previous=config(),style=doc.createElement('link');style.rel='stylesheet';style.href=next.css;style.media='not all';style.dataset.gasRelease=next.version;
  try{await new Promise((resolve,reject)=>{const timer=win.setTimeout(()=>reject(Error('Stylesheet timeout')),20000);style.onload=()=>{win.clearTimeout(timer);resolve();};style.onerror=()=>{win.clearTimeout(timer);reject(Error('Stylesheet unavailable'));};doc.head.appendChild(style);});}catch(error){style.remove();throw error;}
  if(disposed){style.remove();return;}
  if(win.__XEROX_GAS_RPC_RUNNING__>0){style.remove();retry();return;}
  if(typeof win.__XEROX_GAS_BEFORE_UPDATE__==='function'&&await win.__XEROX_GAS_BEFORE_UPDATE__()===false){style.remove();retry();return;}
  if(disposed){style.remove();return;}
  win.dispatchEvent(new win.Event('pwa-updating'));
  const oldStyles=[...doc.querySelectorAll('link[rel="stylesheet"]')].filter(link=>link!==style&&link.href===previous.css);
  const script=doc.createElement('script');script.src=next.js;
  win.__XEROX_GAS_ASSETS__={...previous,...next,route:null};
  try{
   await new Promise((resolve,reject)=>{const timer=win.setTimeout(()=>reject(Error('Application timeout')),30000);script.onload=()=>{win.clearTimeout(timer);resolve();};script.onerror=()=>{win.clearTimeout(timer);reject(Error('Application unavailable'));};doc.body.appendChild(script);});
   if(win.__XEROX_GAS_BOOTED_VERSION__!==next.version)throw Error('Application did not start');
   style.media='all';oldStyles.forEach(link=>link.remove());
   win.dispatchEvent(new win.Event('xerox-gas-assets-changed'));
  }catch(error){win.__XEROX_GAS_ASSETS__=previous;style.remove();throw error;}
  finally{script.remove();win.dispatchEvent(new win.Event('pwa-update-finished'));}
 };
 const check=async(force=false)=>{
  if(disposed||busy||doc.hidden||win.__XEROX_GAS_DOWNLOAD_BUSY__||(!force&&Date.now()-lastCheck<55000))return;
  // Finish current text entry before replacing the application root.
  if(doc.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
  if([...doc.querySelectorAll('textarea')].some(field=>field.value?.trim()))return;
  busy=true;lastCheck=Date.now();
  try{
   let response=await win.fetch('/api/account/client-release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,version:config()?.version||'unknown',error:lastError}),cache:'no-store'});
   if(response.status===401)response=await win.fetch('/api/account/client-release',{cache:'no-store'});
   if(!response.ok)throw Error('Release check failed ('+response.status+')');
   const next=await response.json();if(disposed)return;if(!validRelease(next))throw Error('Invalid release metadata');if(next.version===config()?.version){lastError='';return;}if(next.version===failedVersion&&Date.now()-failedAt<300000)return;
   attemptedVersion=next.version;await apply(next);
   lastError='';
  }catch(error){lastError=String(error?.message||'Update failed').slice(0,200);failedVersion=attemptedVersion;failedAt=Date.now();win.dispatchEvent(new win.CustomEvent('pwa-update-failed',{detail:lastError}));retry();}
  finally{busy=false;}
 };
 const resume=()=>void check(true);const timer=win.setInterval(()=>void check(true),30000),initial=win.setTimeout(()=>void check(true),2000);win.addEventListener('focus',resume);doc.addEventListener('visibilitychange',resume);
 return()=>{disposed=true;win.clearInterval(timer);win.clearTimeout(initial);win.clearTimeout(retryTimer);win.removeEventListener('focus',resume);doc.removeEventListener('visibilitychange',resume);};
}

export function validRelease(value){
 if(!value||typeof value.version!=='string'||value.version.length>250)return false;
 return /^https:\/\/cdn\.jsdelivr\.net\/gh\/[\w.-]+\/[\w.-]+@[a-f0-9]{40}\/gas\/web$/.test(value.base)&&new RegExp('^'+value.base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/app-[\\w-]+\\.js$').test(value.js)&&new RegExp('^'+value.base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/[\\w-]+\\.css$').test(value.css);
}

export function installAutoUpdate(win=window,doc=document){
 let disposed=false,busy=false,lastCheck=0,failedVersion='',failedAt=0,attemptedVersion='';
 const config=()=>win.__XEROX_GAS_ASSETS__;
 const apply=async next=>{
  const previous=config(),style=doc.createElement('link');style.rel='stylesheet';style.href=next.css;style.media='not all';style.dataset.gasRelease=next.version;
  try{await new Promise((resolve,reject)=>{const timer=win.setTimeout(()=>reject(Error('Stylesheet timeout')),20000);style.onload=()=>{win.clearTimeout(timer);resolve();};style.onerror=()=>{win.clearTimeout(timer);reject(Error('Stylesheet unavailable'));};doc.head.appendChild(style);});}catch(error){style.remove();throw error;}
  if(disposed){style.remove();return;}
  if(win.__XEROX_GAS_RPC_RUNNING__>0){style.remove();return;}
  if(typeof win.__XEROX_GAS_BEFORE_UPDATE__==='function'&&await win.__XEROX_GAS_BEFORE_UPDATE__()===false){style.remove();return;}
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
   const response=await win.fetch('/api/config/client-release',{cache:'no-store'});if(!response.ok)return;
   const next=await response.json();if(disposed||!validRelease(next)||next.version===config()?.version||(next.version===failedVersion&&Date.now()-failedAt<300000))return;
   attemptedVersion=next.version;await apply(next);
  }catch{failedVersion=attemptedVersion;failedAt=Date.now();}
  finally{busy=false;}
 };
 const resume=()=>void check();const timer=win.setInterval(resume,60000);win.addEventListener('focus',resume);doc.addEventListener('visibilitychange',resume);
 return()=>{disposed=true;win.clearInterval(timer);win.removeEventListener('focus',resume);doc.removeEventListener('visibilitychange',resume);};
}

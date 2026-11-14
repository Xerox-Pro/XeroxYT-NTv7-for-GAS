export function installViewport(){
 let meta=document.querySelector('meta[name="viewport"]');
 if(!meta){meta=document.createElement('meta');meta.name='viewport';document.head.appendChild(meta);}
 meta.content='width=device-width, initial-scale=1, viewport-fit=cover';
 let scheduled=false;
 const update=()=>{
  scheduled=false;
  const viewport=window.visualViewport;
  const zoom=window.__XEROX_GAS_VIEWPORT_WIDTH__?window.innerWidth/window.__XEROX_GAS_VIEWPORT_WIDTH__:1;
  const height=(viewport&&viewport.scale===1?viewport.height:window.innerHeight)/zoom;
  if(height>0)document.documentElement.style.setProperty('--gas-viewport-height',height+'px');
 };
 const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(update);}};
 update();
 window.addEventListener('resize',schedule,{passive:true});
 window.visualViewport?.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('orientationchange',schedule,{passive:true});
}

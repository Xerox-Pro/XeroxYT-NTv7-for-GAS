// Some GAS/mobile browser combinations retain a 980px iframe layout viewport.
// Use the phone's CSS screen width in that case, without affecting normal
// desktop/tablet windows, pinch zoom or browser-specific non-width media rules.
export function viewportMetrics(win){
 const width=win.innerWidth||win.document.documentElement.clientWidth;
 const mobile=win.navigator.userAgentData?.mobile||/Android.*Mobile|iPhone|iPod/i.test(win.navigator.userAgent||'');
 const screenWidth=win.screen?.width||width;
 const effective=mobile&&screenWidth>0&&width>screenWidth*1.3?screenWidth:width;
 return {width:effective,zoom:width/effective};
}
function compare(actual,operator,value){return operator==='>='?actual>=value:operator==='<='?actual<=value:operator==='>'?actual>value:operator==='<'?actual<value:actual===value;}
export function mediaForWidth(css,width){
 return css.replace(/@media\s*([^{}]+)\{/g,(_,query)=>{
  const rewritten=query.replace(/\(\s*(min-width|max-width|width)\s*:\s*([\d.]+)(px|rem|em)\s*\)/g,(_m,kind,n,unit)=>{
   const target=Number(n)*(unit==='px'?1:16),ok=compare(width,kind==='min-width'?'>=':kind==='max-width'?'<=':'=',target);
   return ok?'(min-width:0px)':'(min-width:10000000px)';
  }).replace(/\(\s*width\s*(>=|<=|>|<|=)\s*([\d.]+)(px|rem|em)\s*\)/g,(_m,op,n,unit)=>compare(width,op,Number(n)*(unit==='px'?1:16))?'(min-width:0px)':'(min-width:10000000px)');
  return '@media '+rewritten+'{';
 });
}
export function installResponsive(win=window,doc=document){
 let source='',style=null,pending=null,lastWidth=0,disposed=false;
 function apply(){
  if(disposed)return;
  const metrics=viewportMetrics(win);
  win.__XEROX_GAS_VIEWPORT_WIDTH__=metrics.width;
  const html=doc.documentElement;
  html.style.zoom=metrics.zoom===1?'':String(metrics.zoom);
  html.dataset.gasLayout=metrics.width<768?'phone':metrics.width<1200?'tablet':'desktop';
  if(metrics.zoom===1){if(style)style.disabled=true;for(const link of doc.querySelectorAll('link[rel="stylesheet"]'))if(link.href===win.__XEROX_GAS_ASSETS__?.css)link.disabled=false;lastWidth=0;return;}
  if(!source){
   const url=win.__XEROX_GAS_ASSETS__?.css;
   if(url&&!pending)pending=win.fetch(url,{credentials:'omit'}).then(response=>{if(!response.ok)throw new Error('Stylesheet unavailable');return response.text();}).then(text=>{source=text;apply();}).catch(()=>{html.style.zoom='';}).finally(()=>{pending=null;});
   return;
  }
  if(!style){style=doc.createElement('style');style.dataset.gasResponsive='true';doc.head.appendChild(style);}
  if(lastWidth!==metrics.width){style.textContent=mediaForWidth(source,metrics.width);lastWidth=metrics.width;}
  style.disabled=false;
  for(const link of doc.querySelectorAll('link[rel="stylesheet"]'))if(link.href===win.__XEROX_GAS_ASSETS__?.css)link.disabled=true;
 }
 apply();win.addEventListener('resize',apply,{passive:true});win.addEventListener('orientationchange',apply,{passive:true});
 return()=>{disposed=true;win.removeEventListener('resize',apply);win.removeEventListener('orientationchange',apply);style?.remove();};
}

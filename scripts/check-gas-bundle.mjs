import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';

// Exercise the actual release bundle with GAS RPC, without a live user account.
const release=JSON.parse(await readFile('gas/web/release.json','utf8'));
const js=await readFile('gas/web/'+release.entry,'utf8');
const css=await readFile('gas/web/'+release.css,'utf8');
assert.ok(css.length>0);
const calls=[],failures=[];
const virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',error=>failures.push(error));
virtualConsole.on('error',(...values)=>failures.push(new Error(values.map(String).join(' '))));
const dom=new JSDOM('<!doctype html><div id="root"></div>',{
 url:'https://example.googleusercontent.com/userCodeAppPanel',
 runScripts:'outside-only',pretendToBeVisual:true,virtualConsole,
});
const w=dom.window;
Object.assign(w,{Request,Response,Headers,TextEncoder,TextDecoder});
w.__XEROX_GAS_ASSETS__={base:'https://cdn.jsdelivr.net/gh/example/app@revision/gas/web'};
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
w.scrollTo=()=>{};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.fetch=async()=>{throw new Error('Unexpected direct network access');};
w.google={script:{get run(){
 let success;
 return {withSuccessHandler(fn){success=fn;return this;},withFailureHandler(){return this;},gasRequest(request){
  calls.push(request);
  const session=request.path==='/api/account/session';
  const data=session?{error:'login required'}:request.path.includes('/status')?{connected:false,configured:false}:request.path.includes('/limits')?{videos:0,searches:0,total:0}:[];
  w.setTimeout(()=>success({status:session?401:200,body:JSON.stringify(data),headers:{'content-type':'application/json'}}),0);
 }};
}}};
async function until(check){
 for(let attempt=0;attempt<100;attempt++){
  if(check())return;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 throw new Error('Timed out waiting for rendered GAS view');
}
try{
 w.eval(js);
 await until(()=>w.document.querySelector('input[autocomplete="username"]'));
 assert.match(w.document.body.textContent,/XeroxYT-NTv7 for GAS/);
 await until(()=>calls.some(call=>call.path==='/api/account/session'));
 [...w.document.querySelectorAll('button')].find(button=>button.textContent==='ログインせずに使う').click();
 await until(()=>w.document.querySelector('input[placeholder*="検索"]'));
 w.location.hash='/instagram';
 await until(()=>calls.some(call=>call.path.startsWith('/api/instagram/')));
 assert.equal(w.location.pathname,'/userCodeAppPanel');
 assert.ok(calls.every(call=>call.path.startsWith('/api/')&&/^[a-f0-9]{64}$/.test(call.session)));
 assert.equal(failures.length,0,failures.map(error=>error.message).join('\n'));
 console.info('GAS bundle verified: login, guest view, Instagram hash navigation and RPC.');
}catch(error){console.error(failures.map(failure=>failure.message));throw error;}finally{w.close();}

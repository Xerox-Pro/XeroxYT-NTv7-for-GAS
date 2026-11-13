import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';

// Exercise the actual release bundle with GAS RPC, without a live user account.
const release=JSON.parse(await readFile('gas/web/release.json','utf8'));
const js=await readFile('gas/web/'+release.entry,'utf8');
const css=await readFile('gas/web/'+release.css,'utf8');
assert.ok(css.length>0);
async function checkView(signedIn){
const calls=[],failures=[];
const virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',error=>failures.push(error));
virtualConsole.on('error',(...values)=>failures.push(new Error(values.map(String).join(' '))));
const dom=new JSDOM('<!doctype html><div id="root"></div>',{
 url:'https://example.googleusercontent.com/userCodeAppPanel',
 runScripts:'outside-only',pretendToBeVisual:true,virtualConsole,
});
const w=dom.window;
const user={id:'bundle-test',username:'testuser'};
if(signedIn){
 w.localStorage.setItem('xerox_last_account_id',user.id);
 w.localStorage.setItem('xerox_site_session_hint',JSON.stringify(user));
 w.localStorage.setItem('xerox_account_history_'+user.id,JSON.stringify({history:[],version:0,dirty:false}));
}
// Old guest markers must not bypass login.
else w.sessionStorage.setItem('xerox_guest','true');
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
  const data=session?(signedIn?{user}:{error:'login required'}):request.path==='/api/account/history'?{history:[],version:0}:request.path.includes('/status')?{connected:false,configured:false}:request.path.includes('/limits')?{videos:0,searches:0,total:0}:[];
  w.setTimeout(()=>success({status:session&&!signedIn?401:200,body:JSON.stringify(data),headers:{'content-type':'application/json'}}),0);
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
 if(!signedIn){
  await until(()=>w.document.querySelector('input[autocomplete="username"]'));
  assert.match(w.document.body.textContent,/XeroxYT-NTv7 for GAS/);
  assert.ok(!w.document.body.textContent.includes('ログインせずに使う'));
  w.location.hash='/instagram';
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(w.document.querySelector('input[autocomplete="username"]'));
  return;
 }
 await until(()=>w.document.querySelector('input[placeholder*="検索"]'));
 w.location.hash='/instagram';
 await until(()=>calls.some(call=>call.path.startsWith('/api/instagram/')));
 w.location.hash='/feed/library';
 await until(()=>[...w.document.querySelectorAll('summary')].some(node=>node.textContent.includes('ローカルデータ')));
 w.localStorage.setItem('xerox_account_history_'+user.id,JSON.stringify({history:[{videoId:'local-test',title:'端末の履歴'}],version:1,dirty:true,savedAt:new Date().toISOString()}));
 [...w.document.querySelectorAll('summary')].find(node=>node.textContent.includes('ローカルデータ')).click();
 await until(()=>w.document.body.textContent.includes('通常動画：1件'));
 assert.ok(w.document.body.textContent.includes('履歴をJSONで書き出す'));
 assert.equal(w.location.pathname,'/userCodeAppPanel');
 assert.ok(calls.every(call=>call.path.startsWith('/api/')&&/^[a-f0-9]{64}$/.test(call.session)));
 assert.equal(failures.length,0,failures.map(error=>error.message).join('\n'));
 console.info('GAS bundle verified: authenticated view, Instagram hash navigation and RPC.');
}catch(error){console.error(failures.map(failure=>failure.message));throw error;}finally{w.close();}

}
await checkView(false);
await checkView(true);

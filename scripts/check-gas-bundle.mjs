import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';

// Exercise the actual release bundle with GAS RPC, without a live user account.
const release=JSON.parse(await readFile('gas/web/release.json','utf8'));
const js=await readFile('gas/web/'+release.entry,'utf8');
const css=await readFile('gas/web/'+release.css,'utf8');
assert.ok(css.length>0);
async function checkView(signedIn,sessionRejected=false){
const calls=[],failures=[];let failSecond=true;
const virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',error=>failures.push(error));
virtualConsole.on('error',(...values)=>{const message=values.map(String).join(' ');if(!message.includes('pagination test failure'))failures.push(new Error(message));});
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
  if(request.path.startsWith('/api/account/announcements')){
   const data=request.path.endsWith('/read')?{readAt:123}:{announcements:[{id:'notice-test',title:'Google連携のご案内',date:'2026-11-18',body:'アカウント別お知らせテスト',readAt:null}]};
   w.setTimeout(()=>success({status:200,body:JSON.stringify(data),headers:{'content-type':'application/json'}}),0);return;
  }
  if(request.path==='/api/account/terms'){w.setTimeout(()=>success({status:200,body:JSON.stringify({version:'test',sections:[['利用規約','テスト規約']],accepted:true}),headers:{'content-type':'application/json'}}),0);return;}
  if(request.path.startsWith('/api/account/dm')){
   const data=request.path==='/api/account/dm/profile'?{nickname:'テスト表示名'}:request.path==='/api/account/dm'?{threads:[{id:'11111111-1111-4111-8111-111111111111',status:'accepted',kind:'normal',label:'テストの会話',updatedAt:1}]}:request.path==='/api/account/dm/rooms'?{rooms:[]}:{messages:[{id:'message-one',text:'こんにちは、DMテストです',mine:false,createdAt:Date.now()}]};
   w.setTimeout(()=>success({status:200,body:JSON.stringify(data),headers:{'content-type':'application/json'}}),0);return;
  }
  if(request.path.startsWith('/api/recommendations?')&&signedIn&&!sessionRejected){
   const page=Number(new URL('https://fixture.test'+request.path).searchParams.get('page'));
   const failed=page===2&&failSecond;if(failed)failSecond=false;
   const video={videoId:'video-page-'+page,title:'Pagination video '+page,author:'Test author',authorId:'UCtest',viewCount:100,publishedText:'今日',lengthSeconds:60,videoThumbnails:[]};
   const data=failed?{error:'pagination test failure'}:{videos:[video],hasMore:true};
   w.setTimeout(()=>success({status:failed?503:200,body:JSON.stringify(data),headers:{'content-type':'application/json'}}),0);return;
  }
  const data=session?(signedIn&&!sessionRejected?{user}:{error:'login required'}):request.path==='/api/account/history'?{history:[],version:0}:request.path.includes('/status')?{connected:false,configured:false}:request.path.includes('/limits')?{videos:0,searches:0,total:0}:[];
  w.setTimeout(()=>success({status:session&&(!signedIn||sessionRejected)?401:200,body:JSON.stringify(data),headers:{'content-type':'application/json'}}),0);
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
 if(!sessionRejected){
  await until(()=>w.document.body.textContent.includes('Pagination video 1'));
  const button=()=>[...w.document.querySelectorAll('button')].find(node=>['さらに読み込む','再試行'].includes(node.textContent));
  await until(()=>button()&&!button().disabled);button().click();
  await until(()=>w.document.body.textContent.includes('pagination test failure'));
  assert.ok(w.document.body.textContent.includes('Pagination video 1'));
  assert.ok(!calls.some(call=>/recommendations\?.*page=3(?:&|$)/.test(call.path)));
  button().click();await until(()=>w.document.body.textContent.includes('Pagination video 2'));
  const page2=calls.filter(call=>/recommendations\?.*page=2(?:&|$)/.test(call.path));
  assert.equal(page2.length,2);assert.equal(page2[0].path,page2[1].path);
 }
 w.location.hash='/settings';
 await until(()=>w.document.querySelector('.display-settings'));
 assert.equal(w.document.querySelectorAll('.display-settings input[type=checkbox]').length,6);
 const hideShorts=w.document.querySelector('.display-settings input[type=checkbox]');hideShorts.click();
 await until(()=>w.document.documentElement.getAttribute('data-pref-hide-shorts')==='true');
 w.location.hash='/shorts';
 await until(()=>w.document.body.textContent.includes('ショートは表示設定で非表示'));
 w.location.hash='/announcements';
 await until(()=>w.document.querySelector('.announcement-card'));
 assert.ok(w.document.querySelector('.announcement-unread'));
 w.document.querySelector('.announcement-card summary').click();
 await until(()=>calls.some(call=>call.path==='/api/account/announcements/read'));
 await until(()=>!w.document.querySelector('.announcement-unread'));
 w.location.hash='/instagram';
 await until(()=>calls.some(call=>call.path.startsWith('/api/instagram/')));
 w.location.hash='/feed/library';
 await until(()=>[...w.document.querySelectorAll('summary')].some(node=>node.textContent.includes('ローカルデータ')));
 w.localStorage.setItem('xerox_account_history_'+user.id,JSON.stringify({history:[{videoId:'local-test',title:'端末の履歴'}],version:1,dirty:true,savedAt:new Date().toISOString()}));
 [...w.document.querySelectorAll('summary')].find(node=>node.textContent.includes('ローカルデータ')).click();
 await until(()=>w.document.body.textContent.includes('通常動画：1件'));
 assert.ok(w.document.body.textContent.includes('履歴をJSONで書き出す'));
 assert.equal(w.location.pathname,'/userCodeAppPanel');
 assert.ok(w.localStorage.getItem('xerox_site_session_hint'));
 w.location.hash='/messages';
 await until(()=>w.document.querySelector('.messages-page'));
 await until(()=>[...w.document.querySelectorAll('.messages-thread')].some(node=>node.textContent.includes('テストの会話')));
 [...w.document.querySelectorAll('.messages-thread')].find(node=>node.textContent.includes('テストの会話')).click();
 await until(()=>w.document.querySelector('textarea[aria-label="メッセージ本文"]'));
 await until(()=>w.document.body.textContent.includes('こんにちは、DMテストです'));
 assert.equal(w.document.querySelector('.messages-page').getAttribute('role'),null,'DM must be a page, not a floating dialog');
 const beforeUpdate=w.localStorage.getItem('xerox_last_account_id');
 await w.__XEROX_GAS_BEFORE_UPDATE__();
 w.eval(js);
 await until(()=>w.document.querySelector('.messages-page'));
 assert.equal(w.localStorage.getItem('xerox_last_account_id'),beforeUpdate);
 assert.equal(w.location.hash,'#/messages');
 assert.equal(w.document.querySelector('input[autocomplete="username"]'),null);
 assert.ok(calls.every(call=>call.path.startsWith('/api/')&&/^[a-f0-9]{64}$/.test(call.session)));
 assert.equal(failures.length,0,failures.map(error=>error.message).join('\n'));
 console.info('GAS bundle verified: authenticated view, Instagram hash navigation and RPC.');
}catch(error){console.error(failures.map(failure=>failure.message));throw error;}finally{w.close();}

}
await checkView(false);
await checkView(true);

await checkView(true,true);

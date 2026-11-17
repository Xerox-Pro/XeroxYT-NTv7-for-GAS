import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../gas/server/Runtime.gs',import.meta.url),'utf8');
function harness(){
 const settings={API_BASE_URL:'https://private.example.com',ACCOUNT_BASE_URL:'https://account.example.com',UPSTREAM_ORIGIN:'https://front.example.com',API_SHARED_SECRET:'top-secret-value'};
 const cache=new Map(),persistent=new Map(),calls=[];let reply={status:200,headers:{'Content-Type':'application/json'},body:{ok:true}};
 const sandbox={PropertiesService:{getScriptProperties:()=>({getProperty:k=>persistent.has(k)?persistent.get(k):settings[k],setProperty:(k,v)=>persistent.set(k,v),deleteProperty:k=>persistent.delete(k),getProperties:()=>Object.assign({},settings,Object.fromEntries(persistent))})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>[...createHash('sha256').update(v).digest()]},UrlFetchApp:{fetch:(url,opts)=>{calls.push({url,...opts});if(reply.throw)throw new Error('https://private.example.com/secret');return {getResponseCode:()=>reply.status,getAllHeaders:()=>reply.headers,getContentText:()=>typeof reply.body==='string'?reply.body:JSON.stringify(reply.body)};}}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {sandbox,calls,cache,persistent,settings,reply:r=>{reply=r;},request:(path='/api/search?q=hello',session='a'.repeat(64),extra={})=>sandbox.gasRequest({path,session,method:'GET',headers:{},...extra})};
}
test('strict paths reject traversal, cross-origin and privileged calls',()=>{
 const h=harness();for(const path of ['https://evil.example/api/search','//evil.example/api/search','/api/../internal','/api/%2e%2e/internal','/api/%252e%252e/internal','/api/search%0d%0aHost:evil','/api/transport-config','/api/account/cloudflare-session','/api/debug/search','/api/search#bad'])assert.equal(h.request(path).status,400,path);
 assert.equal(h.calls.length,0);
 for(const path of ['/api/playlist/test','/api/shorts-ranking?x=1','/api/instagram/public/feed'])assert.equal(h.request(path).status,200,path);
});
test('server chooses fixed URL, origin, shared secret and ignores caller credentials',()=>{
 const h=harness();const r=h.request('/api/search?q=test','a'.repeat(64),{headers:{authorization:'evil',cookie:'other',origin:'https://evil.example'}});
 assert.equal(r.status,200);assert.equal(h.calls[0].url,'https://private.example.com/api/search?q=test');assert.equal(h.calls[0].headers.Authorization,'Bearer top-secret-value');assert.equal(h.calls[0].headers.Origin,'https://front.example.com');assert.equal(h.calls[0].headers.Cookie,undefined);assert.equal(h.calls[0].followRedirects,false);
});
test('update discovery returns only pinned public asset metadata without calling private APIs',()=>{
 const h=harness();h.sandbox.GAS_RELEASE_={repo:'example/app',release:{revision:'a'.repeat(40),entry:'app-test.js',css:'style-test.css',serverHash:'b'.repeat(64)}};
 const response=h.request('/api/config/client-release');assert.equal(response.status,200);assert.equal(h.calls.length,0);
 const data=JSON.parse(response.body);assert.equal(data.js,'https://cdn.jsdelivr.net/gh/example/app@'+'a'.repeat(40)+'/gas/web/app-test.js');
 for(const secret of Object.values(h.settings))assert.equal(response.body.includes(secret),false);
});
test('site cookies stay server-side and are isolated per browser session',()=>{
 const h=harness(),cookie='f'.repeat(64);h.reply({status:200,headers:{'Content-Type':'application/json','Set-Cookie':'__Host-xy_session='+cookie+'; Path=/; Secure; HttpOnly'},body:{user:{id:'one'}}});
 const login=h.request('/api/account/login','a'.repeat(64),{method:'POST',headers:{'content-type':'application/json'},body:'{"username":"one"}'});assert.equal(JSON.stringify(login).includes(cookie),false);
 h.reply({status:200,headers:{'Content-Type':'application/json'},body:{ok:true}});
 h.request('/api/account/session');assert.equal(h.calls.at(-1).headers.Cookie,'__Host-xy_session='+cookie);
 h.request('/api/user/feed/home');assert.equal(h.calls.at(-1).headers.Cookie,'__Host-xy_session='+cookie);
 h.request('/api/user/feed/home','b'.repeat(64));assert.equal(h.calls.at(-1).headers.Cookie,undefined);
 h.reply({status:200,headers:{'Content-Type':'application/json','Set-Cookie':'__Host-xy_session=; Max-Age=0'},body:{ok:true}});h.request('/api/account/logout','a'.repeat(64),{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(h.cache.size,0);assert.equal(h.persistent.size,0);
});
test('redacts upstream URLs, encoded hosts, nested data, keys and secrets',()=>{
 const h=harness();h.reply({status:200,headers:{'Content-Type':'application/json','x-daily-usage-token':'https://private.example.com top-secret-value'},body:{url:'https://private.example.com/a',nested:[{error:'account.example.com top-secret-value'}],encoded:encodeURIComponent('https://private.example.com'), 'https://private.example.com':'private.example.com'}});
 const data=JSON.stringify(h.request());for(const hidden of ['private.example.com','account.example.com','top-secret-value'])assert.equal(data.includes(hidden),false);
});
test('blocks non-JSON streams, redirects, oversized payloads and exception URL leakage',()=>{
 const h=harness();for(const reply of [{status:302,headers:{Location:'https://private.example.com'},body:''},{status:200,headers:{'Content-Type':'video/mp4'},body:'binary'},{throw:true},{status:200,headers:{'Content-Type':'application/json'},body:'invalid'}]){h.reply(reply);const r=h.request();assert.equal(r.status,502);assert.equal(JSON.stringify(r).includes('private.example.com'),false);}
 assert.equal(h.request('/api/user/action','a'.repeat(64),{method:'POST',body:'a'.repeat(131073)}).status,413);
 assert.equal(h.request('/api/user/action','a'.repeat(64),{method:'POST',body:'{}'}).status,415);
});
test('loader follows latest manifest while pinning JS and CSS to one immutable revision',()=>{
 const h=harness();let current;
 h.sandbox.HtmlService={createHtmlOutput:html=>{current={html,setTitle(){return this;},setFaviconUrl(url){this.favicon=url;return this;},addMetaTag(){return this;}};return current;}};
 const config=()=>JSON.parse(current.html.split('window.__XEROX_GAS_ASSETS__=')[1].split(';\n')[0]);
 h.sandbox.ScriptApp={getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/stable/exec'})};
 const release=revision=>({status:200,headers:{},body:{revision,entry:'app-hash.js',css:'style-hash.css'}});
 h.sandbox.GAS_INDEX_HTML_=readFileSync(new URL('../gas/Index.html',import.meta.url),'utf8');h.sandbox.GAS_RELEASE_={repo:'Xerox-Pro/XeroxYT-NTv7-for-GAS',release:release('1'.repeat(40)).body};h.sandbox.doGet({parameter:{route:'/watch?v=test'}});const first=config();assert.ok(first.js.includes('@'+'1'.repeat(40)));assert.equal(first.js.split('/gas/web/')[0],first.css.split('/gas/web/')[0]);assert.equal(first.route,'/watch?v=test');assert.equal(current.favicon,first.base+'/app-icons/favicon.png');
 h.sandbox.GAS_RELEASE_.release=release('2'.repeat(40)).body;h.sandbox.doGet({parameter:{}});const second=config();assert.ok(second.js.includes('@'+'2'.repeat(40)));assert.equal(first.webAppUrl,second.webAppUrl);assert.equal(JSON.stringify(second).includes('private.example.com'),false);
});
test('HTML loads both released stylesheet and script without API configuration',()=>{
 const html=readFileSync(new URL('../gas/Index.html',import.meta.url),'utf8');
 assert.match(html,/stylesheet\.href=window\.__XEROX_GAS_ASSETS__\.css/);
 assert.match(html,/app\.src=window\.__XEROX_GAS_ASSETS__\.js/);
 assert.equal(/API_BASE_URL|API_SHARED_SECRET/.test(html),false);
});

test('persistent session survives cache eviction and a fresh GAS execution, while logout removes it',()=>{
 const h=harness(),token='e'.repeat(64);
 h.reply({status:200,headers:{'Content-Type':'application/json','Set-Cookie':'__Host-xy_session='+token+'; Max-Age=2592000; Path=/; Secure; HttpOnly'},body:{ok:true}});
 h.request('/api/account/login','a'.repeat(64),{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(h.persistent.size,1);
 h.cache.clear();vm.runInContext(source,h.sandbox);
 h.reply({status:200,headers:{'Content-Type':'application/json'},body:{ok:true}});
 h.request('/api/account/session');assert.equal(h.calls.at(-1).headers.Cookie,'__Host-xy_session='+token);
 const key=[...h.persistent.keys()][0],saved=JSON.parse(h.persistent.get(key));
 assert.ok(saved.expires>Date.now()+21600000);
 h.cache.clear();saved.expires=Date.now()-1;h.persistent.set(key,JSON.stringify(saved));
 h.request('/api/account/session');assert.equal(h.calls.at(-1).headers.Cookie,undefined);assert.equal(h.persistent.size,0);
});

test('a session-check 401 preserves the stored cookie, and renewed cookies persist',()=>{
 const h=harness(),token='b'.repeat(64),key='xyg:'+ 'c'.repeat(64);
 h.sandbox.gasStoreCookie_(key,'__Host-xy_session='+token,Date.now()+100000);
 h.reply({status:200,headers:{'Content-Type':'application/json','Set-Cookie':'__Host-xy_session='+token+'; Max-Age=31536000'},body:{user:{id:'one'}}});
 h.request('/api/account/session');
 const record=[...h.persistent.values()].map(v=>JSON.parse(v)).find(v=>v.expires>Date.now()+30000000000);
 assert.ok(record);
 h.reply({status:401,headers:{'Content-Type':'application/json'},body:{error:'unauthorized'}});
 const count=h.persistent.size;h.request('/api/account/session');assert.equal(h.persistent.size,count);
});

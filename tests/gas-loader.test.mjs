import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../gas/Code.gs',import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
function harness(){
 let time=100000,broken=false;const cache=new Map(),calls=[],props={};
 let bundle,release;
 const s={Date:class extends Date{static now(){return time;}},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,text)=>[...createHash('sha256').update(text).digest()]},PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]})},CacheService:{getScriptCache:()=>({get(key){const row=cache.get(key);return row&&row.expires>time?row.value:null;},put(key,value,ttl){cache.set(key,{value,expires:time+ttl*1000});}})},UrlFetchApp:{fetch(url){calls.push(url);if(broken)throw new Error('private backend data');const text=url.includes('release.json')?JSON.stringify(release):bundle;return {getResponseCode:()=>200,getContentText:()=>text};}},HtmlService:{createHtmlOutput:html=>({html,setTitle(){return this;}})}};
 vm.createContext(s);vm.runInContext(source,s);
 function publish(version,extra=''){
  bundle=JSON.stringify({version:1,html:'remote template '+version,source:`function doGet(){return {version:${version},html:GAS_INDEX_HTML_,revision:GAS_RELEASE_.release.revision};} function gasRequest(request){${extra}return {status:200,version:${version},path:request.path};}`});
  release={version:1,revision:String(version).repeat(40),entry:'app-hash.js',css:'style-hash.css',server:'server-runtime.json',serverHash:hash(bundle)};
 }
 publish(1);
 return {s,calls,props,cache,publish,actual(){bundle=JSON.stringify({version:1,source:readFileSync(new URL('../gas/server/Runtime.gs',import.meta.url),'utf8'),html:readFileSync(new URL('../gas/Index.html',import.meta.url),'utf8')});release.serverHash=hash(bundle);},advance(ms=61000){time+=ms;},offline(){broken=true;},corrupt(){bundle+=' ';},badSource(){bundle=JSON.stringify({version:1,html:'',source:'function {'});release.serverHash=hash(bundle);}};
}
test('fixed loader updates remote server functions and HTML, pins one revision and caches downloads',()=>{
 const h=harness();const a=h.s.doGet({});assert.equal(a.version,1);assert.equal(a.html,'remote template 1');assert.equal(h.calls.length,2);
 assert.equal(h.s.gasRequest({path:'/api/search'}).version,1);assert.equal(h.calls.length,2);
 assert.ok(h.calls[1].includes('/'+'1'.repeat(40)+'/gas/web/server-runtime.json'));
 h.publish(2);h.advance();assert.equal(h.s.doGet({}).version,2);
});
test('network, hash and syntax failures use cached code without exposing errors',()=>{
 for(const mode of ['offline','corrupt','badSource']){
  const h=harness();h.s.doGet({});h.advance();h.publish(2);h[mode]();assert.equal(h.s.doGet({}).version,1,mode);
 }
 const empty=harness();empty.offline();const r=empty.s.gasRequest({});assert.equal(r.status,503);assert.ok(!r.body.includes('private backend'));
});
test('never retries a runtime request after execution has begun and only accepts configured GitHub paths',()=>{
 const h=harness();h.s.executions=0;h.publish(1,'executions++;throw new Error("secret");');
 const r=h.s.gasRequest({path:'/api/account/register'});assert.equal(r.status,503);assert.equal(h.s.executions,1);assert.ok(!r.body.includes('secret'));
 h.props.ASSET_REPO='https://evil.example';const count=h.calls.length;assert.equal(h.s.gasRequest({}).status,503);assert.equal(h.calls.length,count);
});

test('published real runtime executes with GAS services and the bundled HTML template',()=>{
 const h=harness();h.actual();let template;
 h.s.HtmlService.createTemplate=html=>{template={html,evaluate(){return this;},setTitle(){return this;},setFaviconUrl(){return this;},addMetaTag(){return this;}};return template;};
 h.s.ScriptApp={getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/fixed/exec'})};
 const result=h.s.doGet({parameter:{route:'/shorts/test'}});
 assert.equal(result,template);assert.ok(template.html.includes('assetConfig'));
 const config=JSON.parse(template.assetConfig);assert.equal(config.route,'/shorts/test');assert.ok(config.base.includes('@'+'1'.repeat(40)));
 assert.equal(h.s.gasRequest({session:'bad',path:'/api/search'}).status,400);
});

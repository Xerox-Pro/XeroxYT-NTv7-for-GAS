import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {validRelease,installAutoUpdate} from '../gas/client/autoUpdate.mjs';

const release=(hash,version)=>{const base='https://cdn.jsdelivr.net/gh/example/app@'+hash.repeat(40)+'/gas/web';return {base,version,js:base+'/app-'+version+'.js',css:base+'/style-'+version+'.css'};};
test('release URLs must be immutable assets from one repository revision',()=>{
 assert.equal(validRelease(release('a','v1')),true);
 assert.equal(validRelease({...release('a','v1'),js:'https://evil.example/app.js'}),false);
 assert.equal(validRelease({...release('a','v1'),css:release('b','v1').css}),false);
});
test('auto update stages assets, starts the new bundle without reloading, and retains route and session',async()=>{
 const old=release('a','v1'),next=release('b','v2');
 const dom=new JSDOM('<link rel="stylesheet" href="'+old.css+'"><div id="root">old</div>',{url:'https://example.test/#/watch?v=abcdefghijk',pretendToBeVisual:true});
 const w=dom.window;Object.defineProperty(w.document,'hidden',{value:false});w.__XEROX_GAS_ASSETS__={...old,webAppUrl:'https://script.google.com/exec'};w.localStorage.setItem('session','unchanged');
 let interval,checks=0,stop;
 w.setInterval=callback=>{interval=callback;return 1;};w.clearInterval=()=>{};
 w.fetch=async()=>{checks++;return {ok:true,json:async()=>next};};
 const appendHead=w.document.head.appendChild.bind(w.document.head);w.document.head.appendChild=node=>{const result=appendHead(node);queueMicrotask(()=>node.onload?.(new w.Event('load')));return result;};
 const appendBody=w.document.body.appendChild.bind(w.document.body);w.document.body.appendChild=node=>{const result=appendBody(node);if(node.tagName==='SCRIPT')queueMicrotask(()=>{w.__XEROX_GAS_BOOTED_VERSION__=next.version;stop();node.onload?.(new w.Event('load'));});return result;};
 stop=installAutoUpdate(w,w.document);
 w.__XEROX_GAS_DOWNLOAD_BUSY__=true;interval();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(checks,0);
 w.__XEROX_GAS_DOWNLOAD_BUSY__=false;interval();await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(w.__XEROX_GAS_ASSETS__.version,'v2');assert.equal(w.location.hash,'#/watch?v=abcdefghijk');assert.equal(w.localStorage.getItem('session'),'unchanged');assert.equal(w.document.querySelectorAll('link[rel="stylesheet"]').length,1);assert.equal(w.document.querySelector('link').href,next.css);
 dom.window.close();
});

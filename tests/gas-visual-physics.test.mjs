import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {startVisualPhysics,tiltGravity} from '../src/lib/visualPhysics.mjs';

function fixture(){
 const dom=new JSDOM('<div id="root"><div data-physics-piece><button id="play">再生</button><img></div><button id="search">検索</button><aside data-effect-controls><button>操作</button></aside><section aria-label="システム管理"><select><option>通常</option></select></section></div>',{pretendToBeVisual:true});
 const {window:w}=dom;Object.defineProperty(w.document,'hidden',{value:false});
 let nextId=0;const frames=new Map();w.requestAnimationFrame=callback=>{frames.set(++nextId,callback);return nextId;};w.cancelAnimationFrame=id=>frames.delete(id);
 const root=w.document.getElementById('root');
 for(const [i,el] of [...root.querySelectorAll('*')].entries())el.getBoundingClientRect=()=>({x:40+i*20,y:50,width:100,height:50,left:40+i*20,top:50,right:140+i*20,bottom:100});
 return {dom,w,root,step(time){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));}};
}
test('gravity follows device tilt and display rotation',()=>{
 assert.ok(tiltGravity(90,0).y>0.99);assert.ok(tiltGravity(0,90).x>0.99);
 assert.ok(tiltGravity(0,90,90).y<-.99);
});
test('spin rotates visible pieces in place and stops when reduced motion is selected',()=>{
 const f=fixture();
 const runtime=startVisualPhysics(f.root,'spin');
 const [piece]=runtime.getPieces();
 f.step(16);
 const angle=piece.el.style.rotate;
 f.step(100);
 assert.notEqual(piece.el.style.rotate,angle);
 assert.equal(piece.el.style.translate,'');
 f.w.document.documentElement.dataset.prefReduceMotion='true';
 f.step(120);
 assert.equal(piece.el.style.rotate,'');
 runtime.destroy();
 f.dom.window.close();
});
test('rigid bodies fall while existing buttons work; cleanup restores styles and nodes',()=>{
 const f=fixture(),button=f.w.document.getElementById('play');let clicks=0;button.addEventListener('click',()=>clicks++);
 const originalParent=button.parentElement;originalParent.style.rotate='2deg';const runtime=startVisualPhysics(f.root,'chaos');
 assert.equal(runtime.getPieces().length,2,'nested buttons and management controls must not become separate bodies');
 const piece=runtime.getPieces()[0],initial=piece.body.position.y;
 for(let i=1;i<=20;i++)f.step(i*16.667);
 assert.ok(piece.body.position.y>initial);button.click();assert.equal(clicks,1);assert.equal(button.parentElement,originalParent);
 runtime.destroy();assert.equal(originalParent.style.rotate,'2deg');assert.equal(originalParent.style.translate,'');f.dom.window.close();
});
test('jelly deforms on press without cancelling the original click, then restores',()=>{
 const f=fixture(),runtime=startVisualPhysics(f.root,'jelly'),button=f.w.document.getElementById('play');let clicks=0;button.addEventListener('click',()=>clicks++);
 const event=new f.w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:80,clientY:80});button.dispatchEvent(event);f.step(17);
 assert.equal(event.defaultPrevented,false);assert.notEqual(button.parentElement.style.scale,'');button.click();assert.equal(clicks,1);
 runtime.destroy();assert.equal(button.parentElement.style.scale,'');f.dom.window.close();
});
test('newly loaded parts are added without resetting existing rigid bodies',async()=>{
 const f=fixture(),runtime=startVisualPhysics(f.root,'chaos');for(let i=1;i<20;i++)f.step(i*17);
 const body=runtime.getPieces()[0].body,y=body.position.y;const button=f.w.document.createElement('button');button.textContent='new';button.getBoundingClientRect=()=>({left:300,top:40,width:80,height:30,right:380,bottom:70});f.root.appendChild(button);
 await new Promise(resolve=>setTimeout(resolve,300));assert.equal(runtime.getPieces()[0].body,body);assert.equal(body.position.y,y);assert.equal(runtime.getPieces().length,3);runtime.destroy();f.dom.window.close();
});
test('chaos adds an impulse every ten seconds without resetting positions',()=>{
 const f=fixture();let callback,period,cleared=false;f.w.setInterval=(fn,ms)=>{callback=fn;period=ms;return 1;};f.w.clearInterval=()=>{cleared=true;};
 const runtime=startVisualPhysics(f.root,'chaos'),body=runtime.getPieces()[0].body,position={...body.position};assert.equal(period,10000);callback();assert.deepEqual(body.position,position);assert.ok(Math.abs(body.force.x)+Math.abs(body.force.y)>0);runtime.destroy();assert.ok(cleared);f.dom.window.close();
});

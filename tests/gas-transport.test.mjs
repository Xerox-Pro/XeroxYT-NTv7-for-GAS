import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRpcTransport} from '../gas/client/transport.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const request=(path='/api/shorts/video?details=2')=>({method:'GET',session:'one',path,headers:{}});
test('duplicate GETs share RPC and short metadata uses a bounded session-local cache',async()=>{
 let calls=0,time=0,finish;
 const dispatch=createRpcTransport(()=>{calls++;return new Promise(resolve=>finish=resolve);},{now:()=>time});
 const a=dispatch(request()),b=dispatch(request());await flush();assert.equal(calls,1);
 finish({status:200,body:'first'});await Promise.all([a,b]);
 assert.equal((await dispatch(request())).body,'first');assert.equal(calls,1);
 time=60001;const c=dispatch(request());await flush();assert.equal(calls,2);finish({status:200});await c;
});
test('cancelling a subscriber does not free a running GAS slot or cancel another subscriber',async()=>{
 const callbacks=[],paths=[];
 const dispatch=createRpcTransport(req=>{paths.push(req.path);return new Promise(resolve=>callbacks.push(resolve));},{maxRunning:1});
 const abort=new AbortController(),a=dispatch(request(),abort.signal),shared=dispatch(request());
 await flush();abort.abort();await assert.rejects(a,{name:'AbortError'});
 const next=dispatch(request('/api/home'));await flush();assert.equal(paths.length,1);
 callbacks.shift()({status:200});await shared;await flush();assert.equal(paths.length,2);
 callbacks.shift()({status:200});await next;
});
test('queued feed requests take priority over metadata and writes invalidate cached results',async()=>{
 const callbacks=[],paths=[];
 const dispatch=createRpcTransport(req=>{paths.push(req.path);return new Promise(resolve=>callbacks.push(resolve));},{maxRunning:1});
 const first=dispatch(request('/api/limits'));await flush();
 const details=dispatch(request()),feed=dispatch(request('/api/user/feed/shorts'));
 callbacks.shift()({status:200});await first;await flush();assert.equal(paths[1],'/api/user/feed/shorts');
 callbacks.shift()({status:200});await feed;await flush();callbacks.shift()({status:200});await details;
 const write=dispatch({...request('/api/account/logout'),method:'POST'});await flush();callbacks.shift()({status:200});await write;
 const fresh=dispatch(request());await flush();assert.equal(paths.at(-1),request().path);assert.equal(paths.length,5);callbacks.shift()({status:200});await fresh;
});

test('piggybacked status cannot be served from a stale metadata cache',async()=>{
 let count=0;
 const dispatch=createRpcTransport(async()=>({status:200,body:String(++count)}));
 const req=request();
 assert.equal((await dispatch(req)).body,'1');
 assert.equal((await dispatch(req)).body,'1');
 assert.equal((await dispatch({...req,sidecar:true})).body,'2');
 assert.equal((await dispatch({...req,sidecar:true})).body,'3');
});

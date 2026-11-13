import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withGasKey} from '../gas/cloudflare/gas-key.mjs';

test('GAS-only key preserves existing credentials and rewrites only authenticated GAS traffic',async()=>{
 const calls=[];
 const wrapped=withGasKey({fetch:async(request,env)=>{calls.push({request,env});return new Response('ok');}});
 const env={API_SHARED_SECRET:'existing-site-key',GAS_API_SHARED_SECRET:'new-gas-key',ALLOWED_ORIGINS:'https://site.example.com'};
 const request=(key,origin='https://script.google.com')=>new Request('https://api.example.com/api/account/login',{method:'POST',headers:{Authorization:'Bearer '+key,Origin:origin,'Content-Type':'application/json',Cookie:'__Host-xy_session=abc'},body:'{"username":"test"}'});
 await wrapped.fetch(request('new-gas-key'),env,{});
 assert.equal(calls[0].request.headers.get('Authorization'),'Bearer existing-site-key');
 assert.equal(calls[0].request.headers.get('Origin'),'https://site.example.com');
 assert.equal(calls[0].request.headers.get('Cookie'),'__Host-xy_session=abc');
 assert.equal(await calls[0].request.text(),'{"username":"test"}');
 assert.equal(calls[0].env,env);
 const legacy=request('existing-site-key','https://site.example.com');
 await wrapped.fetch(legacy,env,{});assert.equal(calls[1].request,legacy);
 const wrong=request('wrong');await wrapped.fetch(wrong,env,{});assert.equal(calls[2].request,wrong);
 assert.equal((await wrapped.fetch(request('new-gas-key','https://other.example.com'),env,{})).status,403);
 assert.equal(calls.length,3);
 assert.equal(env.API_SHARED_SECRET,'existing-site-key');
});

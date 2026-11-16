import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPrivateMode} from '../src/lib/privateMode.mjs';

test('private or ephemeral storage is blocked without flagging normal Chromium quota',()=>{
 assert.equal(classifyPrivateMode({localStorageWorks:false,indexedDbWorks:true}),true);
 assert.equal(classifyPrivateMode({localStorageWorks:true,indexedDbWorks:false}),true);
 assert.equal(classifyPrivateMode({localStorageWorks:true,indexedDbWorks:true,chromiumQuota:100*1024*1024}),true);
 assert.equal(classifyPrivateMode({localStorageWorks:true,indexedDbWorks:true,chromiumQuota:1024*1024*1024}),false);
 assert.equal(classifyPrivateMode({localStorageWorks:true,indexedDbWorks:true}),false);
});

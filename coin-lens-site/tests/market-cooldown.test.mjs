import test from 'node:test';
import assert from 'node:assert/strict';
import {retryAt,marketFetch} from '../lib/market-cooldown.mjs';
test('Retry-After respects dates and long delays, with a conservative minimum',()=>{
 const now=1700000000000;assert.equal(retryAt('300',now),now+300000);assert.equal(retryAt('bad',now),now+60000);assert.equal(retryAt(new Date(now+600000).toUTCString(),now),now+600000);
});
test('429 persists cooldown and prevents the next provider request',async()=>{
 let until=null,calls=0;const db={prepare(sql){return {bind(...v){this.v=v;return this},async first(){return {until}},async run(){until=this.v[2]}}}};
 const f=marketFetch(db,async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'300'}})});
 assert.equal((await f('https://example.test')).status,429);await assert.rejects(f('https://example.test'),/cooldown/);assert.equal(calls,1);assert.ok(until>Date.now()+290000);
});

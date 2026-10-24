import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {readScanCache,saveScanCache,cacheFallback} from '../lib/scan-cache.mjs';
test('cache keeps the original retrieval time, isolates queries, and never replaces good data with empty/error results',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0003_neat_warbird.sql','utf8'));
 const db={prepare(q){return {bind(...args){return {first:async()=>sql.prepare(q).get(...args),run:async()=>sql.prepare(q).run(...args)}}}}};
 const now=Date.now(),result={version:3,fetchedAt:new Date(now-10000).toISOString(),coins:[{address:'A'}],warnings:[]};
 try{await saveScanCache(db,'one',result);const cached=await readScanCache(db,'one',now);assert.equal(cached.fetchedAt,result.fetchedAt);assert.equal(await readScanCache(db,'two',now),null);
 await saveScanCache(db,'one',{...result,coins:[]});assert.equal((await readScanCache(db,'one',now)).coins.length,1);
 const fallback=cacheFallback(cached,'rate limited',now+60000);assert.equal(fallback.stale,true);assert.equal(fallback.logging.snapshots,0);assert.equal(fallback.fetchedAt,result.fetchedAt);assert.equal(fallback.retryAt,now+60000);
 assert.equal(await readScanCache(db,'one',now+86400001),null);
 }finally{sql.close()}
});

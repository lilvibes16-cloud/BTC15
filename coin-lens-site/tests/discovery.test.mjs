import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {ingestLaunches,launchCandidates,markLaunchChecks,discoveryStatus,normalizeLaunch} from '../lib/discovery.mjs';
import {scan} from '../lib/scanner.mjs';
const a='HUzd8ghoHoudDC44sMNqU3462Pf8Pd3ZCmfJFyDupump', b='HsBzctAzz5axr54WsChSEKH4BC9ftAiuev8k1wousEiH';
function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0001_lethal_speed.sql','utf8'));return {sql,db:{prepare(q){let args=[];return {bind(...v){args=v;return this},async all(){return {results:sql.prepare(q).all(...args)}},async first(){return sql.prepare(q).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}}}}},async batch(s){return Promise.all(s.map(x=>x.run()))}}};}
test('launch deduplication preserves first knowledge time and unpriced mints',async()=>{const {db,sql}=database();try{
 const e={mint:a,txType:'create',receivedAt:90000};
 assert.equal((await ingestLaunches(db,{events:[e,e,{mint:'bad',txType:'create'}]},100000)).inserted,1);
 await ingestLaunches(db,{events:[e,{mint:b,txType:'migrate'}]},110000);
 const c=await launchCandidates(db,120000);assert.equal(c.length,2);assert.equal(c[0].firstSeen,100000);
 await markLaunchChecks(db,[c[0]],[],120000);assert.equal((await launchCandidates(db,121000))[0].address,b);
 const status=await discoveryStatus(db,121000);assert.equal(status.totals.tokens,2);assert.equal(status.totals.indexedEvents,0);assert.equal(status.totals.migrations,1);
 assert.equal(normalizeLaunch({mint:a,txType:'buy'}),null);
 }finally{sql.close()}});
test('launch candidates survive unavailable promotion sources and remain pending without prices',async()=>{
 const f=async url=>url.includes('/tokens/')?Response.json([]):new Response('',{status:503});
 const r=await scan(f,{launches:[{address:a,firstSeen:Date.now()}]});assert.equal(r.coins.length,0);assert.equal(r.pendingLaunches.length,1);assert.equal(r.discovered,1);
});

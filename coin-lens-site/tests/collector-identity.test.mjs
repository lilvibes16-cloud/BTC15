import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCollectorToken,COLLECTOR_IDENTITY as cfg} from '../lib/collector-identity.mjs';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test',alg:'RS256',use:'sig'};
const now=Date.now(),t=Math.floor(now/1000);
const base={iss:cfg.issuer,aud:cfg.audience,sub:`repo:${cfg.repository}:ref:${cfg.ref}`,repository:cfg.repository,repository_id:cfg.repositoryId,repository_owner_id:cfg.ownerId,ref:cfg.ref,workflow_ref:cfg.workflow,event_name:'schedule',iat:t,nbf:t,exp:t+300};
const encode=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
async function token(claims=base,head={alg:'RS256',typ:'JWT',kid:'test'}){const p=encode(head)+'.'+encode(claims);return p+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(p))).toString('base64url');}
const options={now,cache:false,fetcher:async url=>{assert.equal(url,cfg.jwks);return Response.json({keys:[jwk]})}};
test('valid signature and exact repository/workflow scope authorize the collector',async()=>{
 assert.equal(await verifyCollectorToken(await token(),options),true);
 assert.equal(await verifyCollectorToken(await token({...base,sub:`repo:lilvibes16-cloud@${cfg.ownerId}/BTC15@${cfg.repositoryId}:ref:${cfg.ref}`}),options),true);
});
test('forks, pull requests, different workflows, wrong audience and expired tokens fail closed',async()=>{
 for(const changed of [{repository_id:'1'},{repository_owner_id:'1'},{ref:'refs/heads/dev'},{workflow_ref:'other'},{event_name:'pull_request'},{aud:'other'},{sub:'other'},{exp:t-1},{nbf:t+100},{iat:t-700}])assert.equal(await verifyCollectorToken(await token({...base,...changed}),options),false);
 assert.equal(await verifyCollectorToken(await token(base,{alg:'none',typ:'JWT',kid:'test'}),options),false);
 const signed=await token();assert.equal(await verifyCollectorToken(signed.slice(0,-8)+'AAAAAAAA',options),false);
 assert.equal(await verifyCollectorToken(signed,{...options,fetcher:async()=>new Response('',{status:503})}),false);
});

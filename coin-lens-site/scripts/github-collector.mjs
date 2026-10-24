import {launchFeed} from './pumpportal-feed.mjs';
// Bounded research batch for GitHub Actions. No long-lived secrets or trades.
const site='https://coin-lens-research.bushyhill20.chatgpt.site';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function credentials(){
 const endpoint=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 if(endpoint.protocol!=='https:')throw Error('Invalid OIDC endpoint');
 endpoint.searchParams.set('audience',site);
 const r=await fetch(endpoint,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!r.ok)throw Error(`OIDC HTTP ${r.status}`);
 const {value}=await r.json();if(!value)throw Error('Missing OIDC credential');return {Authorization:`Bearer ${value}`};
}
async function request(path,headers,method='GET',body=null){
 const r=await fetch(site+path,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(110000)});
 if(!r.ok){const e=Error(`${path} HTTP ${r.status}`);e.status=r.status;throw e;}return r.json();
}
const ticks=Math.min(60,Math.max(1,Number(process.env.COLLECTOR_TICKS)||5));
const feed=launchFeed();
let failed=0,scanSaved=false;
for(let i=0;i<ticks;i++){
 const start=Date.now();
 if(i%5===0)scanSaved=false;
 try{
  const headers=await credentials();
  const batch=feed.batch();
  const discovery=await request('/api/discovery',headers,'POST',batch);feed.ack(batch.events.length);
  const collection=await request('/api/logging/collect',headers,'POST');
  // Discovery every five ticks; outcomes sampled every minute while this job runs.
  const scan=!scanSaved?await request('/api/scan',headers):null;
  if(scan&&scan.logging?.state!=='saved')throw Error('Scan was not persisted');
  if(scan)scanSaved=true;
  console.log(JSON.stringify({at:new Date().toISOString(),tick:i+1,discovery,collection,savedSnapshots:scan?.logging?.snapshots??0}));
 }catch(e){failed++;console.error(JSON.stringify({at:new Date().toISOString(),tick:i+1,error:e.message}));if(e.status===401||e.status===403)break;}
 if(i<ticks-1)await sleep(Math.max(0,60000-(Date.now()-start)));
}
feed.close();
if(failed)process.exitCode=1;

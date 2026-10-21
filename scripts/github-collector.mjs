// Bounded research batch for GitHub Actions. No long-lived secrets or trades.
const site='https://coin-lens-research.bushyhill20.chatgpt.site';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function credentials(){
 const endpoint=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 if(endpoint.protocol!=='https:')throw Error('Invalid OIDC endpoint');
 endpoint.searchParams.set('audience',site);
 const r=await fetch(endpoint,{headers:{Authorization:`Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!r.ok)throw Error(`OIDC HTTP ${r.status}`);
 const {value}=await r.json();if(!value)throw Error('Missing OIDC credential');const c=JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString()); console.log(JSON.stringify({identity:Object.fromEntries(['iss','aud','sub','repository','repository_id','repository_owner_id','ref','workflow_ref','event_name','iat','exp','nbf'].map(k=>[k,c[k]]))}));return {Authorization:`Bearer ${value}`};
}
async function request(path,headers,method='GET'){
 const r=await fetch(site+path,{method,headers,redirect:'error',signal:AbortSignal.timeout(110000)});
 if(!r.ok){const e=Error(`${path} HTTP ${r.status}`);e.status=r.status;throw e;}return r.json();
}
let failed=0;
for(let i=0;i<5;i++){
 const start=Date.now();
 try{
  const headers=await credentials();
  const collection=await request('/api/logging/collect',headers,'POST');
  // Discovery once per batch; outcomes sampled every minute while this job runs.
  const scan=i===0?await request('/api/scan',headers):null;
  if(scan&&scan.logging?.state!=='saved')throw Error('Scan was not persisted');
  console.log(JSON.stringify({at:new Date().toISOString(),tick:i+1,collection,savedSnapshots:scan?.logging?.snapshots??0}));
 }catch(e){failed++;console.error(JSON.stringify({at:new Date().toISOString(),tick:i+1,error:e.message}));if(e.status===401||e.status===403)break;}
 if(i<4)await sleep(Math.max(0,60000-(Date.now()-start)));
}
if(failed)process.exitCode=1;

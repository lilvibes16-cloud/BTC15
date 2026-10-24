import {FALLBACK_SIGNING_KEYS} from './github-signing-keys.mjs';
// Public trust configuration, never a credential. Immutable IDs prevent namespace reuse.
export const COLLECTOR_IDENTITY = {
 issuer:'https://token.actions.githubusercontent.com',
 jwks:'https://token.actions.githubusercontent.com/.well-known/jwks',
 audience:'https://coin-lens-research.bushyhill20.chatgpt.site',
 repository:'lilvibes16-cloud/BTC15',repositoryId:'1418078330',ownerId:'342221225',
 ref:'refs/heads/main',workflow:'lilvibes16-cloud/BTC15/.github/workflows/collect.yml@refs/heads/main',
};
let cachedKeys=null,cachedUntil=0;
function bytes(s){if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid encoding');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));}
export async function verifyCollectorToken(token,{fetcher=fetch,now=Date.now(),cache=true,onReject=(_stage)=>{}}={}){
 let stage='format';const reject=()=>{onReject(stage);return false;};
 try{
  if(typeof token!=='string'||token.length>16000)return reject();
  const parts=token.split('.');if(parts.length!==3)return reject();
  const h=JSON.parse(new TextDecoder().decode(bytes(parts[0]))),c=JSON.parse(new TextDecoder().decode(bytes(parts[1]))),cfg=COLLECTOR_IDENTITY,t=now/1000;
  if(h.alg!=='RS256'||h.typ!=='JWT'||typeof h.kid!=='string'||h.crit)return reject();
  stage='claims';const subjects=[`repo:${cfg.repository}:ref:${cfg.ref}`,`repo:lilvibes16-cloud@${cfg.ownerId}/BTC15@${cfg.repositoryId}:ref:${cfg.ref}`];
  if(c.iss!==cfg.issuer||c.aud!==cfg.audience||!subjects.includes(c.sub)||c.repository!==cfg.repository||c.repository_id!==cfg.repositoryId||c.repository_owner_id!==cfg.ownerId||c.ref!==cfg.ref||c.workflow_ref!==cfg.workflow||!['push','schedule','workflow_dispatch'].includes(c.event_name))return reject();
  stage='time';if(![c.exp,c.nbf,c.iat].every(Number.isFinite)||c.exp<=t||c.nbf>t+30||c.iat>t+30||c.iat<t-600||c.exp-c.iat>600)return reject();
  stage='jwks_fetch';let keys=cache&&cachedUntil>now?cachedKeys:null;
  if(!keys){
   try{const r=await fetcher(cfg.jwks,{signal:AbortSignal.timeout(8000),redirect:'error',headers:{Accept:'application/json'}});if(!r.ok)throw Error('Issuer unavailable');keys=(await r.json()).keys;if(!Array.isArray(keys))return reject();if(cache){cachedKeys=keys;cachedUntil=now+300000;}}
   catch{keys=FALLBACK_SIGNING_KEYS;onReject('using_pinned_keys_during_issuer_outage');}
  }
  stage='jwks_key';const jwk=keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));if(!jwk)return reject();
  stage='key_import';const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  stage='signature';const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));return valid||reject();
 }catch{return reject();}
}

import {env} from 'cloudflare:workers';
import {verifyCollectorToken} from './collector-identity.mjs';
// Sites validates and supplies visitor identity. A separate secret protects unattended
// collection because the Site's existing audience is public.
export async function loggingActor(request:Request):Promise<string|null>{
 const bearer=request.headers.get('authorization');
 if(bearer?.startsWith('Bearer ')&&await verifyCollectorToken(bearer.slice(7),{onReject:(stage:string)=>console.warn('collector_identity_rejected',stage)}))return 'collector';
 const secret=(env as unknown as Record<string,string>).RADAR_COLLECTOR_KEY;
 const supplied=request.headers.get('X-Radar-Collector-Key');
 if(secret&&supplied){
  const encoder=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(secret)),crypto.subtle.digest('SHA-256',encoder.encode(supplied))]);
  let mismatch=0;const aa=new Uint8Array(a),bb=new Uint8Array(b);for(let i=0;i<aa.length;i++)mismatch|=aa[i]^bb[i];if(mismatch===0)return 'collector';
 }
 return request.headers.get('oai-authenticated-user-id')||null;
}
export function sameOriginMutation(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}

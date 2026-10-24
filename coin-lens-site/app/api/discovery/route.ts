import {env} from 'cloudflare:workers';
import {loggingActor,sameOriginMutation} from '../../../lib/logging-auth';
import {ingestLaunches,discoveryStatus} from '../../../lib/discovery.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await discoveryStatus(env.DB),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Discovery unavailable'},{status:503})}}
export async function POST(request:Request){
 if(!sameOriginMutation(request)||await loggingActor(request)!=='collector')return Response.json({error:'Collector identity required'},{status:401});
 try{const body=await request.text();if(body.length>400000)return Response.json({error:'Batch too large'},{status:413});return Response.json(await ingestLaunches(env.DB,JSON.parse(body)),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Discovery ingestion failed'},{status:400})}
}

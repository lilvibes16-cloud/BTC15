import {env} from 'cloudflare:workers';
import {loggingActor,sameOriginMutation} from '../../../../lib/logging-auth';
import {collectOutcomes} from '../../../../lib/logging.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const actor=await loggingActor(request);if(!actor||!sameOriginMutation(request))return Response.json({error:'Authenticated collection required.'},{status:401});
 const source=actor==='collector'&&request.headers.get('authorization')?.startsWith('Bearer ')?'github_actions':'manual';
 try{return Response.json(await collectOutcomes(env.DB,fetch,Date.now(),source),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Collection failed. The job log retains its status.'},{status:503})}
}

import {env} from 'cloudflare:workers';
import {loggingActor} from '../../../../lib/logging-auth';
import {loggingStatus} from '../../../../lib/logging.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const actor=await loggingActor(request);if(!actor)return Response.json({error:'Sign in to view your persistent scan log.',signIn:'/signin-with-chatgpt?return_to=%2Flogging'},{status:401});
 try{return Response.json(await loggingStatus(env.DB,actor),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Persistent logging is unavailable. Try again shortly.'},{status:503})}
}

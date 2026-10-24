import {env} from 'cloudflare:workers';
import {loggingStatus} from '../../../../lib/logging.mjs';
export const dynamic='force-dynamic';
// Public market research only. Personal watchlists and user-scoped scans stay private.
export async function GET(){
 try{return Response.json(await loggingStatus(env.DB,'collector'),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Research log unavailable.'},{status:503})}
}

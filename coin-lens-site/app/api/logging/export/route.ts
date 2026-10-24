import {env} from 'cloudflare:workers';
import {loggingActor} from '../../../../lib/logging-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const actor=await loggingActor(request);if(!actor)return Response.json({error:'Sign in required.'},{status:401});
 if(!env.DB)return Response.json({error:'Storage unavailable'},{status:503});
 const db=env.DB;
 const url=new URL(request.url),cursor=url.searchParams.get('cursor')||'';
 const records=await db.prepare('SELECT s.*,c.actor,c.source,c.warnings FROM radar_snapshots s JOIN radar_scans c ON c.id=s.scan_id WHERE c.actor=? AND s.id>? ORDER BY s.id LIMIT 101').bind(actor,cursor).all();
 const list=records.results.slice(0,100);const exported=[];
 for(const row of list){const outcomes=await db.prepare('SELECT * FROM radar_outcomes WHERE snapshot_id=? ORDER BY horizon').bind(row.id).all();exported.push({...row,features:JSON.parse(String(row.features)),config:JSON.parse(String(row.config)),outcomes:outcomes.results.map(o=>({...o,result:o.result?JSON.parse(String(o.result)):null}))});}
 return Response.json({snapshots:exported,nextCursor:records.results.length>100?list[list.length-1].id:null,ordering:'Stable ID pagination; sort by at for chronological replay.'},{headers:{'Cache-Control':'no-store'}});
}

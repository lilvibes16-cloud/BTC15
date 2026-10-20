// Run on an always-on Node 22+ host, or use --once from a one-minute cron job.
// Credentials belong in the host's secret environment, never in source or logs.
const site=process.env.RADAR_SITE_URL;
const key=process.env.RADAR_COLLECTOR_KEY;
if(!site||!key)throw Error('Set RADAR_SITE_URL and RADAR_COLLECTOR_KEY in the host environment.');
const url=new URL(site);if(url.protocol!=='https:'||url.username||url.password)throw Error('An HTTPS Site origin is required.');
const headers={'X-Radar-Collector-Key':key};
async function request(path,method='GET'){
 const response=await fetch(new URL(path,url),{method,headers,redirect:'error',signal:AbortSignal.timeout(150000)});
 if(!response.ok)throw Error('Collector endpoint returned HTTP '+response.status);
 return response.json();
}
async function tick(){
 // Sample existing positions first, so discovery cannot delay due checkpoints.
 const collection=await request('/api/logging/collect','POST');
 const scan=await request('/api/scan');
 if(scan.logging?.state!=='saved')throw Error('New scan was not persisted.');
 console.log(JSON.stringify({at:new Date().toISOString(),collection,savedSnapshots:scan.logging.snapshots}));
}
if(process.argv.includes('--once'))await tick();
else {let stopping=false;process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});while(!stopping){const start=Date.now();try{await tick()}catch(e){console.error(JSON.stringify({at:new Date().toISOString(),error:e.message}))}if(!stopping)await new Promise(resolve=>setTimeout(resolve,Math.max(1000,60000-(Date.now()-start))))}}

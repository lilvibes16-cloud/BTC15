// Shared by the producer and both screens to prevent version drift.
export const SCAN_VERSION=3;
export function validScan(data){return data?.version===SCAN_VERSION&&Array.isArray(data.coins)&&Number.isFinite(Date.parse(data.fetchedAt));}
export function scanFailure(message,failures=[]){
 const error=new Error(message);error.sources=failures;
 error.retryAt=Math.max(0,...failures.map(f=>Number(f.retryAt)||0))||null;
 error.message=message+(failures.length?' '+[...new Set(failures.map(f=>f.error).filter(Boolean))].join(' · '):'');
 return error;
}

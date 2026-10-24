// Single configuration surface. Changes apply only to new snapshots.
// Existing records retain their own immutable definition and old-gate settings.
export const LOGGING_CONFIG = {
 version:'logging-1.0',
 runner:{multiple:5,windowMinutes:120,minLiquidityRetention:0.8,minLiquidityUsd:20000},
 horizonsMinutes:[15,60,120,240,1440],
 sampling:{targetIntervalSeconds:60,maxCheckpointLatenessSeconds:120,maxGapSeconds:120,minCoverage:0.9},
 collector:{maxPairsPerRun:180,maxOutcomesPerRun:150,leaseSeconds:180},
 collapse:{maxPriceRetention:0.1,maxLiquidityRetention:0.1},
 reporting:{minDistinctTokensWithMatureOutcomes:200},
};

export const OLD_GATE_CONFIG={minLiquidity:20000,minVolume5m:2000,minTransactions5m:20,minBuyShare:0.6,minAcceleration:1.5,minAgeMinutes:60,maxAgeHours:72,maxChange5m:25,maxChange1h:100,warningChange5m:-10,warningChange1h:-30,warningBuyShare:0.4,warningLiquidityChange:-10,minComparisonMs:60000,maxComparisonMs:600000};
export const DISCOVERY_CONFIG={version:'pumpportal-1',maxBatch:300,maxCandidates:60,lookbackHours:24,heartbeatStaleSeconds:180};
export const SCORING_CONFIG={version:'weighted-1',alertScore:50,minCoverage:0.6,
 weights:{liquidity:20,volume5m:15,acceleration:15,momentum:10,buyVolumeShare:20,uniqueBuyers:20},
 buckets:[
 {id:'1–6h',minHours:1,maxHours:6,minLiquidity:20000,minVolume5m:2000,minAcceleration:1.5,minBuyVolumeShare:0.6,minUniqueBuyers:15,maxChange5m:25,maxChange1h:100},
 {id:'6–24h',minHours:6,maxHours:24,minLiquidity:30000,minVolume5m:3000,minAcceleration:1.7,minBuyVolumeShare:0.6,minUniqueBuyers:25,maxChange5m:20,maxChange1h:80},
 {id:'24–72h',minHours:24,maxHours:72,minLiquidity:50000,minVolume5m:5000,minAcceleration:2,minBuyVolumeShare:0.65,minUniqueBuyers:40,maxChange5m:15,maxChange1h:60}
 ],
 warnings:{minLiquidity:5000,drop5m:-10,drop1h:-30},
};
export const OWNERSHIP_CONFIG={version:'ownership-1.2',publicRpc:'https://solana-rpc.publicnode.com',sniperSeconds:10,sniperSlots:8,coordinatedMinWallets:2,synchronizedSlots:1,
 maxTransactionVersion:1,maxRecentSignatures:10,maxRpcRequests:60,deadlineMs:45000,maxGraphWallets:40,maxGraphEdges:200,maxBlockTransactions:2000,maxWallets:12,maxFundingWallets:4,maxFundingSignatures:3,cacheSeconds:300,maxPoolAgeSeconds:120,
 sellFractions:[0.1,0.25,0.5,1],commonFunderMaxRecipients:10};

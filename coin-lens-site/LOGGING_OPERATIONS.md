# Runner Radar — Step 1 operations

Current stage: persistent logging and outcome collection. Unattended writes and due 1h/2h checkpoints have been verified. Coverage remediation precedes discovery changes.

## Storage and isolation

Cloudflare D1 (SQLite compatible) persists scans, per-token snapshots, same-pair price/liquidity observations, checkpoint outcomes, job history and collector leases. Migrations are in drizzle/. Browser scans require Sites-authenticated identity to save; anonymous scans are still usable and explicitly show that they were not saved. Logs and exports are scoped to the authenticated visitor. The collector has a separate `collector` dataset used for unattended discovery scans. No wallet secrets or trade actions are present.

The existing Site is public. Preserve its audience. Unattended endpoints require the exact GitHub workflow OIDC identity or RADAR_COLLECTOR_KEY (a secret runtime variable); do not rely on Site bypass access alone. Never expose this secret in URLs, browser code, logs, or source. A signed-in visitor can also manually request collection of public market observations. Cross-origin browser mutations are rejected.

## Running the collector

The GitHub workflow is configured; verify successful data writes before treating it as operational. The local ChatGPT scheduler cannot run faster than hourly; do not schedule an hourly replacement and claim that 15-minute checkpoints are covered.

Legacy alternative only: deploy scripts/outcome-worker.mjs to a suitable always-on Node 22+ host. Configure RADAR_SITE_URL as the Site's HTTPS origin and RADAR_COLLECTOR_KEY as the matching secret. Run `node scripts/outcome-worker.mjs`. Alternatively, a one-minute cron can run it with `--once`. The collector samples already-logged pairs first, then retrieves and logs a fresh discovery scan. It does not trade, need wallet connections, or republish the Site.

Verify both POST /api/logging/collect and GET /api/logging/status with the secret header X-Radar-Collector-Key, without browser identity. Verify autonomous repeated runs and an actual due checkpoint before changing the dashboard's not-configured notice. Never claim the host is running based only on a successful manual tick.

## Measurement contract

lib/logging-config.mjs freezes a copy of the definition in each scan/snapshot. Default runner: observed 5x within 120 minutes, with USD liquidity >=80% of entry and >=$20,000 at the observed crossing and the 2h checkpoint. A separate 2h checkpoint is stored in addition to 15m, 1h, 4h, 24h. This definition measures USD liquidity value, not LP-token retention.

Observations target 60-second intervals. Checkpoint retrieval tolerance is 120 seconds after its due time; actual timestamps and lateness are retained. Missed checkpoints are not filled with a current price. Peak multiples are sampled lower bounds, never exact historical highs. Price coverage, maximum gaps and missing liquidity are retained; sparse coverage does not become a negative runner label. Retrieval timestamps are not asserted to be exchange event timestamps.

Unique buyers and buy/sell volume are currently NULL with reasons: DEX Screener does not supply them. Rugged is NULL/unverified: price and liquidity collapse alone do not establish a rug. A separate collapse warning uses the configured price and liquidity retention thresholds. Old-gate raw fields, checks, outputs, risk factors and configuration are saved. Its logged reference is a single-snapshot gate, without the browser-session liquidity delta.

The collector keeps the original pair under observation when it leaves discovery, handles provider errors separately from pair disappearance, uses a 3-minute lease to avoid overlapping jobs, and records backlog. Per-tick bounds are in config; monitor backlog and sampling gaps before expanding discovery. No retention deletion is configured.

Performance reporting is locked below 200 distinct tokens with usable mature 2h outcomes. Repeated snapshots/checkpoints from the same token do not inflate that sample threshold. There is no implemented win-rate, backtest or scoring upgrade yet. Sampled labels will still require validation even after the count threshold.

## API and coverage

GET /api/scan returns logging.state = saved, sign_in_required, or failed. A successful market request is never presented as a successful write when storage failed.

GET /api/logging/status provides scoped counts, pending/recorded/missed checkpoints, frozen configuration and recent snapshots. GET /api/logging/export pages 100 records using nextCursor; sort the immutable at field for chronological replay. Exported snapshots include their checkpoint outcomes. GETs must not be cached.

Baseline before this change: 0 persisted token snapshots; no checkpoint queue; no background collection; no measured performance. The dashboard compares this baseline with live scoped counts. Populate after metrics only from readback.
# GitHub Actions collector (replaces the uncreated Render job)

The confirmed public repository `lilvibes16-cloud/BTC15` contains a bounded scheduled research workflow. Up to 60 collection ticks run one minute apart; discovery scans every five ticks. The workflow timeout is 75 minutes. The workflow requests short-lived GitHub OIDC tokens. The Site verifies RS256 signatures against GitHub's fixed JWKS endpoint, issuer, audience, immutable owner/repository IDs, subject, main branch, exact workflow path, event and expiry. No long-lived collector secret is stored in GitHub. Existing signed-in access remains separate.

Scheduled starts are best effort. GitHub can delay/drop runs and disables public repository schedules after 60 days without repository activity. This is not a guaranteed minute-level feed. Preserve the original checkpoint tolerance and coverage requirements; never widen them to manufacture complete outcomes. The dashboard shows the last verified automated collection and marks activity older than 3 minutes stale. Shared research records are public market data from actor `collector`; personal scans remain actor-scoped.

For incident review use GitHub workflow logs and `/api/logging/research`. The legacy secret-based worker remains available but is not scheduled. Render has no created service. The GitHub workflow is the scheduling source of truth.


GitHub JWKS retrieval from the hosted runtime failed during integration. The verifier falls back only on transport failure to official public keys captured in `lib/github-signing-keys.mjs`. It does not use a fallback when a successful issuer response omits the key. Unknown or rotated keys fail closed. Refresh these public keys from the official endpoint when GitHub rotates them; the last collection timestamp exposes stalled collection. No token or private key is bundled.

## Cadence change, 2026-10-22
Before: five-tick batches; 485 snapshots, 174 distinct tokens, 0 recorded / 437 completed 15m checkpoints. Scheduled batches started roughly 30–40 minutes apart. After: 60-tick batches configured, discovery every five ticks. Post-change outcome coverage must be measured after checkpoints mature; no accuracy improvement is claimed from configuration alone.

Follow-up live readback found DEX Screener HTTP 429 errors. A shared durable cooldown now respects Retry-After (at least 60 seconds) across scan and outcome requests. In-flight calls can still finish, but later requests stop during cooldown. Cooldown cannot recover missing prices. No improved outcome coverage is yet established.

## Step 2: launch discovery

PumpPortal is a third-party feed. Only its public `subscribeNewToken` and `subscribeMigration` subscriptions are used, on one websocket per GitHub job. No paid trade/account subscriptions or trade execution endpoints are used. A live connection returned real create events during implementation. Server ingestion requires the existing verified collector identity. Names, symbols, mint, signature, creator-at-create, receipt time and server first-knowledge time are bounded and persisted; duplicates cannot overwrite first knowledge. Migrations are separate events. This does not prove creator ownership history.

A 1,000-event memory buffer reports dropped events, sends up to 300 per tick, and removes events only after acknowledged persistence. Disconnects reconnect with backoff. Job boundaries still have gaps. The dashboard shows feed heartbeat, disconnect/staleness and event/index counts. New mints survive missing DEX Screener indexing as unpriced discovery records; no fabricated snapshot price or risk percentage is assigned.

Scans enrich up to 60 discovery mints from the last 24h in oldest-check order, alongside profile/boost/watch candidates. This is a bounded, incomplete sample. DEX rate limits apply to all enrichment. Old outcome pairs still have their separate sampling budget; increasing discovery can exceed outcome coverage capacity. Baseline: 0 launch-feed events. After metrics come from `/api/discovery`, not seeded examples. Discovery does not establish predictive accuracy.

## Step 3: weighted score

`lib/radar-config.mjs` holds runner definition, sampling, old-gate comparison, discovery and weighted screening thresholds. The 1–6h, 6–24h and 24–72h buckets have independent thresholds. Six weighted features sum to 100. Missing features earn zero without weight redistribution; coverage is shown separately. Buy-volume share and unique buyers are distinct inputs, currently unknown with the free market source. Trade count remains only in the preserved old-gate comparison. Major low-liquidity/price-drop warnings suppress alerts. A score is not a likelihood of success.

Each new snapshot freezes score configuration and feature contributions. `SCORING_COMPARISON.json` records the before/after selection diagnostic on ten real recent stored snapshots: zero old-gate passes and zero weighted alerts, with 19% mean feature coverage including records outside age buckets. No improvement or win rate follows from this tiny selection-only comparison. UI displays current old-gate vs weighted counts on the same scan.

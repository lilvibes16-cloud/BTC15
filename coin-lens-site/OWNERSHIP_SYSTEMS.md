# Supply & dump-risk evidence — implementation and limits

New surface: `/ownership`; API: `/api/ownership?token=<mint>&pair=<optional PumpSwap pool>`. Runner cards link with the token and selected pair. No signing, trading or paid subscriptions were added. The existing site audience is preserved.

## Data and provenance

The adapter uses read-only Solana JSON-RPC. `SOLANA_RPC_URL` can override the public PublicNode endpoint in `lib/radar-config.mjs`. It is a public endpoint, not a purchased service or a production SLA. Direct testing returned actual mint metadata and a 1,000,000,000 token supply at slot 460095257 for the test mint. This does not establish hosted-runtime access or complete history. Local Worker preview requests failed at the network layer and correctly rendered unknown metrics. Production results must be reported separately after deployment.

Official Pump/PumpSwap IDLs were retrieved 2026-10-22; pinned SHA256 hashes and source URLs are in `lib/ownership/protocol-schema.mjs`. Only event records emitted while the actual protocol program is atop the invocation stack are decoded. Failed transactions are excluded. New protocol layouts or undecodable events produce gaps, not inferred buys. The source uses finalized/confirmed RPC data as documented in request configuration (currently confirmed, therefore reorgs remain possible).

One inspection requests bounded recent mint/bonding-curve and pool transactions, the launch transaction when discovered previously, its full block when available, a small participant funding-history sample, and up to 12 current owner balances. Limits, sniper windows, cache TTL and simulation fractions are centralized. This is not a full transaction index. Public RPC restrictions, missing archive blocks and observation gaps are explicit.

## Five systems

1. **Bundle candidates.** Multiple buyers in the launch slot; multiple buyers in a shared transaction; or shared observed prior funding plus synchronized early buys. Timing alone is low confidence. The system never declares a confirmed Jito bundle without bundle-service evidence. End-of-launch-slot balances reconstruct original sampled holdings only when a decoded creation transaction is present in the complete retrieved launch block. Percentages use creation-event supply. Otherwise original holdings remain unknown.
2. **Sniper candidates.** Decoded buys within 10 seconds OR eight slots of decoded creation. The first observed buy supplies an entry quote and its denomination. Current holdings use owner token accounts. Decoded sales retain token quantity, quote proceeds and signatures; transfers are never relabeled sales, and proceeds are not realized profit. Complete original holdings for later-slot entries and lifetime realized sales remain unavailable without fuller history.
3. **Developer roles and potential links.** Creation-event user and creator remain distinct roles. Mint authority and launch-feed hints are not substituted for either. Direct role-wallet percentages and broader transfer/funding-linked exposure are shown separately. One-hop token/funding recipients are candidates, not proven controlled wallets. Known pool/curve/program accounts are excluded from link expansion. Incoming shared funders are not automatically developer-controlled. Circulating supply stays unknown without a verified lock/vesting/exclusion ledger.
4. **Dump scenarios.** Verified PumpSwap account ownership/layout and its actual vault mints/owners are checked. One getMultipleAccounts call retrieves the pool/vault snapshot. Gross constant-product math produces quote proceeds, post-sale spot-price drop and average slippage for selling 10/25/50/100% of measured holdings. It excludes fees and is not an execution quote. Virtual-reserve pools, retained fee balances, special modes, frozen vaults and unsupported token extensions disable simulation. Classic SPL and metadata-only Token-2022 base tokens with classic quote tokens are supported; unrecognized extensions fail closed. Bonding curves and concentrated-liquidity pools are unsupported.
5. **Wallet graph.** Direct funding, target-token transfers, common funders and synchronized buys carry signatures and categorical relationship confidence. Common service funding and independent bots are explicit confounders. Confidence is not an insider probability. Drawing and edge counts are bounded. The device-local tracked-wallet list highlights decoded buy matches in the inspection sample; this is not a continuous notification service.

## Deduplication and missing data

Supply totals use the UNION of wallet addresses across bundle, sniper, developer, token-transfer-linked and direct-funding-linked sets. Addresses are measured once regardless of category membership. Duplicate conflicting balance records become unknown. Raw quantities use BigInt. Partial balances yield a lower bound with measured/unknown-wallet counts; when none of the identified wallets has a measured balance, supply is unknown rather than zero; impossible totals are rejected. No lower bound is described as complete risky supply, and the term “flagged” does not imply malicious ownership.

## Persistence and time boundaries

Migration `0002_next_korg.sql` appends immutable report records with configuration, normalized source evidence and the report. Export downloads the report/transaction evidence. Cache lasts five minutes and preserves its retrieval timestamp. Scans attach only previously recorded evidence at or before the scan timestamp and within TTL; later reports cannot leak into earlier scans. Ownership fields do not silently change weighted scoring or claim validated predictive value. Inspections are on demand, not an additional scheduled worker.

## Before/after verification

Before: no integrated five-system inspection or cross-category union in Runner Radar. After: five inspection sections, persistent evidence/export, overlap-safe supply aggregation, supported-pool scenarios and an interactive evidence graph.

Synthetic correctness case (not live market performance): category shares 30% bundle, 30% sniper and 10% developer sum naively to 70%. The tested wallet union correctly returns 30% across two wallets. Other tests cover timing boundaries, false attribution, transfer/sale separation, conflicting balances, large integer amounts, reserve math, source errors, block balance reconstruction and timestamp-safe snapshot attachment. No win rate or improved hit rate is claimed.

Remaining coverage: confirmed bundle IDs, complete launch/first-seconds history, lifetime sales/cost basis, circulating-supply classification, multi-hop control attribution and non-supported pool simulation are NOT completed by this bounded adapter. Working authenticated historical RPC/indexer access may be needed. No credential should be pasted into chat; configure secrets through the hosting environment.

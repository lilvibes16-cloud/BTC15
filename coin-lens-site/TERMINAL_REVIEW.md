# Coin Lens mobile research terminal

The homepage now starts with the token scanner instead of the large promotional hero. A compact sticky header, address search, sortable token rows, device watchlist and token research route put market information first on phones.

## Scope and provenance

This is the actual Coin Lens Sites frontend, based on production source commit `f6bb438deb4fdb962ce6654f728265f1b5b23b91`. BTC15 is a separate collector repository. The review branch is `feat/mobile-research-terminal` in the existing website repository.

The redesign changes only the homepage, root stylesheet import/metadata, new terminal components/styles, token research view and presentation helpers/tests. Scanner APIs, ownership analysis, database schemas/records, scan logging, scheduled collection, deployment configuration and dependencies are unchanged. No trades, deployment or merge are performed.

## Behavior

- Trending sorts by observed one-hour price change; New by indexed pair creation time; Volume by one-hour volume. None predicts future returns.
- Rows show available market cap, liquidity, volume, price change and pair age. Missing numbers are explicitly unavailable.
- Search continues using `/api/scan`, including Solana mint addresses and the existing watchlist request parameter.
- Auto-refresh remains optional, every 60 seconds while visible, and honors provider cooldowns. Watchlist/settings persist in browser storage.
- Failed refreshes retain the original snapshot timestamp and mark old quotes stale. Saved addresses remain removable and openable even when their quotes are unavailable.
- Token research reuses `/api/ownership` and `/api/wallets/discover` on demand. No invented holdings, sniper/bundle percentages or risk probabilities.
- Developer, sniper and bundle sections show measured values only when launch verification, identified wallets and balance coverage exist. Candidate windows use the existing ownership configuration. Holder percentages are labeled against total supply.
- Price chart uses distinct successful observations from the current page session and pool. Cached timestamps are not new points; gaps over two minutes are not connected. Historical candles are explicitly Coming soon, with a link to the provider chart where available.

## Verification

- Baseline: 53 existing Node tests passed. After redesign: 58 tests passed, including five new cases covering missing values, sorting, chart observations, ownership measurement guards and stale-data timestamps.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false`.
- Production build: Sites `build-site.mjs` helper (no publishing).
- Browser QA: scanner at 390px and 320px framed viewports; document widths 375/305px after scrollbar, with matching scroll widths (no horizontal page overflow). Token research at 390px also matched scroll/client widths. Desktop at 1348px matched scroll/client widths.
- Verified loading skeletons, stale cached quotes, missing liquidity, provider-error state, empty watchlist, persisted saved token across navigation, missing-quote watchlist management, settings dialog/auto-refresh, volume sorting, contract search submission and token detail navigation.
- Layout used a recorded public production snapshot locally with its original timestamp and an explicit QA-source warning. Snapshot fixtures, local database cache and temporary viewport harness are not included in the change.

## Limits and review handoff

Public-provider requests failed in the local preview environment. These checks verify stale/error behavior and presentation, not reliable live coverage or successful on-chain evidence retrieval. Historical candles and complete holder/launch coverage remain unavailable. No win-rate or trading-performance claims are made.

The user approved publishing the frontend source to the public `lilvibes16-cloud/BTC15` repository on October 24, 2026. The GitHub review copy lives under `coin-lens-site/` on `feat/coin-lens-mobile-terminal`. The first commit imports the existing frontend as a baseline; the second contains the redesign, so reviewers can inspect the focused before/after diff. The collector and root deployment files remain unchanged. This source review does not deploy the website; deployment and merging require a separate decision.

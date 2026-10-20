# Coin Lens outcome collector

Read-only scheduled collector for the Coin Lens research site. No wallet credentials or trading functions.

Run with Node 22: `node scripts/outcome-worker.mjs --once`.

Configure `RADAR_SITE_URL` and secret `RADAR_COLLECTOR_KEY` in the hosting environment. Never commit credentials. Run every minute. Each invocation records observations for previously logged pairs, finalizes due outcomes, then persists a fresh scan. Records live in the site's D1 database, not this host's filesystem.

A completed deployment does not prove successful scheduled collection. Check runtime logs and the site's logging API. Missing observations stay unknown; sampled peaks are lower bounds. Results are research observations, not validated profit or risk predictions.

Deployment configuration is managed through Render, not a Blueprint in this repository.

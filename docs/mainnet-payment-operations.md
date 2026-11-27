# Mainnet payments

Energy, Life, XP and AI usage stay outside the payment service. The service stores the reusable deposit wallet, its encrypted key, quotes, verified payment receipts, signed sweep jobs and the financial journal in Redis. The browser applies an authenticated receipt to IndexedDB and can recover the same receipt after a disconnection.

## Server configuration

| Variable | Purpose |
|---|---|
| `HELIUS_API_KEY` | Mainnet RPC access including finalized history, account state, fee quotes and rent. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Durable payment storage and the REST SSE work subscription. |
| `MIND_TOKEN_MINT` | Exact Mainnet SPL or supported Token-2022 mint. |
| `WALLET_PRIVATE_KEY` | Reviewed treasury keypair that pays applicable network fees and rent. |
| `ENCRYPTION_KEY` | 32-byte hexadecimal key or versioned keyring. Retain every key version used by unresolved wallets. |

Once these dependencies work, quotes can be made without a Redis approval record. The quote uses the canonical SOL-paired Pump.fun curve or PumpSwap pool and validated current pricing. The server calculates and locks the integer MIND amount for ten minutes. During migration, stale prices or insufficient liquidity, users keep their deposit address and no payable QR is issued. Use the Solana Pay request to bind a transfer to its payment. Manually sending to the displayed address requires operator reconciliation.

## Unattended recovery and checkout safety

Operate `node tools/mindling-payment-worker.cjs --watch` as a supervised persistent process using the same six variables. It subscribes to the payment work channel, scans durable jobs after connecting and checks due work on a notified or scheduled wake. Its EVAL-to-SSE probe must succeed before it publishes checkout readiness. Vercel's request handlers do not host this process. Keep the worker monitored and set restart policy on its host. A one-off invocation without `--watch` reconciles due jobs without advertising readiness.

New quotes and sponsored checkout signatures require a current worker heartbeat. A successful check records a receipt and queues the amount for sweep in a single ledger transition. Redis notification wakes the worker while the queue provides recovery after reconnect. An unknown broadcast uses the same signed bytes for safe recovery. A new signature requires finalized failure of the preceding sweep. Ambiguous expired outcomes and unsolicited or mismatched transfers need operator review.

Use `node tools/mindling-payment-admin.cjs pause` to stop new acceptance, and `resume` to remove the emergency pause after resolving its cause. Payment receipts and authorized recovery remain accessible while paused, subject to the journal fence. Use `audit <manifest.json>` to compare the journal with a separately retained head. The manifest takes `previous` with its `sequence`, `key`, and `hash`, or `previous:null` and `genesis:true` for initial history. If the journal fence disagrees with its head, leave checkout blocked and reconcile from the separately retained checkpoint. Pause before rotating the mint or treasury, and settle or reconcile unresolved payments and sweeps under their original configuration. The service performs no automatic refunds.

Before live use, verify Redis failover and acknowledged-write durability, restore from backup, use an external audit checkpoint, verify Vercel-to-worker notifications, sponsor exposure and treasury funding, and test supported mobile Solana Pay wallets with separately authorized activity. [Local verification and open production risks](browser-native-energy-verification.md)

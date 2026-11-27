# Payment Lite verification

Historical report for the earlier Redis-backed implementation at e1da1bc. The [browser-native verification report](browser-native-energy-verification.md) describes current behavior. Use the old commit to reproduce this report.

The baseline is commit `97ee45c` on `feat/mindling-payment-v1`. The implementation and verification stayed local.

## Reference implementation

The Bundler archive was extracted into a separate temporary directory and inspected as source. Its endpoints remained unexecuted.

| Bundler source | Observed behavior |
|---|---|
| `api/create-payment.js`, `handler` | Constructs the Upstash REST client from environment variables. Generates a random Solana keypair and UUID. Stores plaintext secret bytes, the public address and a `done` flag under `payment:{token}`, with a 30-minute TTL. |
| `api/verify-payment.js`, `handler`, `getTokenProgramId` | Looks up a bearer token and checks its wallet's confirmed SOL balance. Estimates a fee with a 5,000-lamport fallback, spends the remaining SOL from the deposit account, uses Jupiter, burns SPL tokens and finally saves `done`. Signing and provider calls occur before the completion flag. It has neither an atomic credit/receipt nor persistent sweep state. |
| `api/verify-access.js`, `handler` | Checks whether the Authorization header is the literal `ok`. |
| `app.js`, `createPayment`, `verifyPaymentOnce` and access/top-up handlers | Opens the modal, generates an SOL transfer QR in the browser, checks payment on demand and stores access time in localStorage. Payment tokens live in JavaScript variables, so reload loses the payment reference even though access time persists. |

Mindling reuses the simple deposit, scan, explicitly check, restore and collect flow. The implementation uses P-256 ownership, AES-GCM key retention, finalized exact SPL MIND transaction verification, an atomic credit and a durable sweep. Jupiter, trading, burning, Bundler tools and the static access token were outside this refactor.

## Checkout and HTTP 503

The old message “Mainnet checkout is temporarily paused” is mapped from `PAYMENTS_PAUSED`. The old `requireOpen` checks the Redis `financial-control` record for Mainnet, `OPEN` and a future integer `verifiedUntil`. A missing approval, explicit pause, invalid approval or expired approval all reproduce the same HTTP 503 and UI message. The browser error alone cannot identify which of those conditions existed in production. A sanitized API `error.code` and a read-only check of the activation state and expiry at the time of the incident would distinguish them. Missing Energy ledger configuration is a separate 503.

The updated admin command still requires audit, an external journal checkpoint, operator attestations and active recovery. It writes a durable approval. Earlier approvals retain their original expiration until reviewed. Missing approval, intentional pause, expired legacy approval, stale worker heartbeat, missing or invalid Mainnet credentials, treasury signing failure and unavailable pricing have distinct diagnostics. Checkout requires a valid current market quote, an eligible authoritative balance, sponsorship and a recent worker heartbeat. A missing Helius key, mint or treasury key leaves the Redis-backed Energy API and deposit bootstrap usable.

## Storage and Redis changes

| Records | Before | After |
|---|---|---|
| `owner:*`, `energy:*`, `operation:*`, `provider-emergency-total`, `legacy-review:*` | Identity binding, authoritative Energy, reservations, encrypted operation results, cost and capacity authorization | Same protections and fields. Compare-and-set writes only changed keys. Plain Energy projection uses one snapshot when no stage update is needed. |
| `nonce:*`, `used:*`, `rate:*` | Stored challenge/session record, proof replay marker and rate counter | New clients carry a five-minute sealed ticket. Redis atomically claims the P-256 proof's nonce and charges its rate limit. Old requests still use their original challenge records. |
| `deposit:*` | Wallet custody embedded in each payment session | One nonexpiring encrypted custody record per Mindling. Current legacy wallet reused when available. All older payment records and encrypted keys remain recoverable. |
| `checkout:*`, `checkout-global`, `payment:*`, `market:pump:*` | Active quote and creation budgets, priced quote with deposit key, validated price anchor | Same quote limits and snapshots. New quote rows reference the stable deposit address and carry no private key material. Creation does not rewrite unchanged Energy or activation records. |
| `signature:*`, `financial-control`, `financial-head`, `financial-event:*`, `financial-sponsor` | Replay claim, approval and journal fence, immutable audit events, fee/rent accounting | Existing records kept. A compare-and-set still checks preceding state before any authorized transition or receipt replay. |
| `verify-work:*`, `sweep-work:*`, `payment-worker-ready` | Persistent verification and exact-signed sweep recovery with two scans per pass | Job formats kept. A shared scan services both prefixes. The supervised loop publishes a two-minute readiness marker. |

Reusable receiving accounts avoid producing encrypted keys on each quote. The tradeoff is that payment history can share a public address and deposits can coexist in one SPL account. Every credit still requires a finalized transaction matching its quote, mint and amount. The worker sweeps the credited amount and leaves unrelated or extra assets for operator review. If a sweep outcome is unknown, recovery uses the exact signed bytes when safe. Handling unsolicited transfers, late payments or ambiguous funds stays an operator task. Pause and reconcile unresolved jobs before changing the configured mint or treasury. A quote for a previous mint can remain visible for recovery, with its QR disabled, and normal sweeping requires the original mint and signing configuration.

## Measured local workload

`node tests/payment-lite-metrics.cjs <checkout-directory>` runs the same scenario against the baseline and the current code. The harness calls the actual HTTP handlers, ledger, checkout and recovery worker against an instrumented Redis mock. It measures code-generated Redis REST requests and separately traces Redis operations inside EVAL. MGET and MSET count as one command regardless of key count. Reads and writes below exclude the EVAL wrapper and count its nested operations once. HTTP totals cover Mindling API calls, including the simulated wallet's GET and POST. AI and chain providers are mocked. Experimental setup writes and host-level work are outside the measured workload. The browser test independently checks the zero-call UI rows.

| Operation | HTTP before | HTTP after | Redis reads before | Redis reads after | Redis writes before | Redis writes after |
|---|---:|---:|---:|---:|---:|---:|
| Fresh initialization | 3 | 3 | 5 | 5 | 9 | 7 |
| Browser reload with initialized profile | 0 | 0 | 0 | 0 | 0 | 0 |
| Navigation | 0 | 0 | 0 | 0 | 0 | 0 |
| Inactivity | 0 | 0 | 0 | 0 | 0 | 0 |
| Wallet address rendering | 0 | 0 | 0 | 0 | 0 | 0 |
| Talk after reload | 4 | 4 | 16 | 8 | 17 | 11 |
| Teach | 3 | 3 | 16 | 8 | 15 | 10 |
| Deep | 3 | 3 | 16 | 8 | 15 | 10 |
| Research, including explicit permission and one search/evaluation | 5 | 5 | 27 | 14 | 25 | 17 |
| Opening checkout with active authentication | 1 | 1 | 15 | 3 | 14 | 9 |
| Checking unpaid payment | 1 | 1 | 2 | 1 | 4 | 4 |
| Successful payment, including wallet GET/POST | 3 | 3 | 24 | 7 | 26 | 12 |
| Sweep recovery across two worker passes | 0 | 0 | 41 | 19 | 18 | 6 |
| **Total** | **23** | **23** | **162** | **73** | **143** | **86** |

Measured reads and writes fall from **305 to 159**, a **47.9% reduction**. Redis REST requests fall from **144 to 101**, a **29.9% reduction**. The request count includes **60 EVAL calls on each side**. Counting EVAL wrappers in addition to their nested commands would give **365 to 219**, a **40.0% reduction**. The 80% target was not achieved. Proof replay checks, atomic reservations, server validation before client commit, terminal settlement, fee exposure, the journal and interrupted-work recovery still require durable operations. The test does not extrapolate a 30-minute production workload. Worker scheduling is separate from browser inactivity. An empty worker iteration now makes one SCAN and one heartbeat write instead of two SCANs.

Upstash charges per command on pay-as-you-go plans and counts replicated writes in global databases. Its EVAL docs describe atomic execution and individual nested Redis commands. The published pages used here leave the billing treatment of this workload's EVAL internals unconfirmed. An isolated Upstash database and usage-dashboard delta for a measured replay are required to establish billable impact. Global read replicas are eventually consistent. The implementation forwards the documented sync token within the Redis client and retains authoritative compare-and-set checks for critical actions. [Upstash pricing](https://upstash.com/pricing/redis) · [EVAL](https://upstash.com/docs/redis/commands/scripting/eval) · [Consistency](https://upstash.com/docs/redis/features/consistency) · [Read-your-writes](https://upstash.com/docs/redis/howto/readyourwrites)

## Verification and activation

The focused Node suites exercise Energy, signed session replay, actual local Ed25519 wallet creation and legacy key recovery, simulated concurrent and duplicate settlement, exact finalized SPL and Token-2022 transfer checks, wrong mint, wrong recipient, under- and overpayment, late and failed transfers, Pump.fun/PumpSwap price validation, migration, signed checkout, loss of sweep broadcast response and automatic recovery. The mocked Chromium test covers desktop and mobile, Energy at 10, 5, 1 and 0, explicit checkout, local countdown, post-regeneration recovery, confirmation, reload and unavailable pricing. It measures zero network calls for post-initialization navigation, cached wallet rendering and countdowns.

Production readiness still requires the six approved variables, a validated actual MIND mint and market, funded and reviewed treasury exposure, an active supervised worker, a tested backup/restore and failover policy with an external ledger checkpoint, wallet compatibility and audited operator approval. Existing Research recovery tests pass. The reported production `RESPONSE_PARSE_ERROR / COMPLETION_INCOMPLETE` still requires provider/request diagnostics.

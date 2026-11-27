# Browser-native Energy and payment verification

Implemented locally on `feat/mindling-payment-v1`, based on `e1da1bc`. All AI, Helius, Redis and payment-provider verification used isolated fixtures.

## What changed

- The source in `bundler-main.zip` was extracted into a temporary directory and read. `api/create-payment.js` creates a random deposit keypair and stores a token-indexed payment in Redis. `api/verify-payment.js` checks the deposit's SOL balance, sends SOL to its treasury and marks the entry complete. In `app.js`, `createPayment` displays a QR and `verifyPaymentOnce` checks it on demand. Mindling keeps this separation and the explicit check. It uses SPL MIND, exact finalized transaction evidence, encrypted persistent keys, an atomic receipt and a durable sweep. It leaves the old plaintext keys, TTL, balance-only checks, Jupiter, burning and access-token logic in the reference project.
- `energy-client.js`, `energy-ledger.cjs`, the server AI authorization and settlement proxy, and the Redis-based progression and Research receipt recovery paths were removed. `/api/mindling/learn` and `/api/mindling/reason` directly call their original AI handlers. Talk, Teach, Deep, corrections, research and its semantic workers send their original unsigned AI requests. The old `/api/mindling/energy` URL now accepts payment operations only. Its existing signature namespace and Redis payment namespace remain compatible.
- IndexedDB owns Energy and progression. Local reducers spend 1 for Talk, 2 for Teach and 3 for Deep under the existing rules. Elapsed time gives one normal Energy point per 12 minutes up to the current capacity. Bonus Energy remains separate. Read/write gameplay transactions serialize local mutation across tabs, and the journal and processed IDs prevent duplicate local spending. Do not rely on a renderer's cached balance to authorize a write.
- A returning profile migrates the last saved local Energy snapshot without a Redis read. The migration preserves its timestamps, remaining points and bonus, restores the capacity for the saved stage, and retains the old applied revision only as a cutoff for historical paid receipts. Removed server reservations are neither locally deducted nor used to grant Energy. Pending server settlements remain archived remotely. Temporary discrepancies in their accounting are not reconstructed.

## Reported failures

**HTTP 402 after regeneration.** In `e1da1bc`, production Talk sent the request through `EnergyClient.transport` and the payment runtime's `protect` wrapper. `energyLedger.admit` rejected a new operation with `ENERGY_LOW` and HTTP 402 when its Redis projection minus reservations fell below the cost. The browser separately projected its cached balance, so the display did not prove that Redis would admit the operation. Research also had a separate Redis readiness guard. Production Redis data for the reported request was not inspected, so its exact remote balance and reservations are unknown. Removing the wrapper eliminates this application's obsolete 402 gate. Original provider error handling remains in place.

**Mainnet HTTP 503.** The reported “needs an operator approval” copy mapped directly to `PAYMENT_ACTIVATION_REQUIRED`, emitted by `requireOpen` when `financial-control` was absent. The new path works with no approval record. A genuine emergency pause still blocks new quotes and sponsorship. Existing payments can be checked and swept during the pause as long as the journal fence is intact.

## Payment boundary and migration

A fresh Mindling can bootstrap its encrypted Ed25519 deposit wallet asynchronously with P-256 identity authentication. The saved public address and payment references are local display and recovery data. Reusable wallets and older encrypted deposit records are retained. Pricing, checkout and the worker use only the six approved payment variables. Helius, pricing, sponsorship or wallet-bootstrap failure leaves local gameplay and existing AI routes available.

The browser allows a new quote at zero spendable Energy and rechecks the latest IndexedDB snapshot immediately before asking for it. The payment server deliberately has no Energy eligibility check or Energy fields. It protects funds through exact Mainnet mint validation, finalized chain evidence, backed quotes, authenticated ownership, fee exposure limits, an emergency pause, a valid journal fence and proof of a working recovery worker. Quotes keep the existing $1.99, original Pump.fun/PumpSwap pricing and ten-minute expiry. Previously opened payment references remain selectable when Energy has regenerated.

Verification atomically records one owner-bound receipt and payment signature claim, and queues the exact amount for sweeping. The API returns the receipt alone. The browser validates its shape, session and identity from the authenticated response, and commits the receipt marker and refill in the same IndexedDB transaction. Rechecking the same receipt after spending Energy gives no second refill in that database. The server returns the same receipt after a lost response and can revalidate it against the journal. For historical receipts, a cached revision at or above the old credit revision indicates a previously reflected refill. A receipt with a later revision can be applied once. An older receipt with no usable local revision requires operator review. The receipts do not make local storage tamper-proof or enforce single application across unrelated browser data stores.

A successful verification publishes a recovery wake-up together with the durable sweep job. The externally supervised Node worker subscribes to Upstash SSE, drains stored work after connecting, and schedules retries for the next pending job. It performs no idle scans with no pending work. A separate liveness probe and heartbeat continue against the payment database so checkout can fail closed if recovery is offline. Sweep execution reuses the same persisted signed bytes when safe after an ambiguous broadcast. The receipt and signed funds remain recoverable without the browser.

Vercel request handlers do not run the long-lived subscriber on their own. Before accepting payments, provision and supervise it outside Vercel, confirm that Redis publishes from the deployed Vercel region to that subscriber, and verify restart, backup/restore, signed transaction sponsorship and a real mint/pricing path on a separately authorized setup. The actual Redis and Solana services were not contacted during these tests. [Operations and prerequisites](mainnet-payment-operations.md)

## Redis measurements

Ordinary operations were tested against the real API modules with the Redis adapter instrumented to fail on a command. Talk, Teach, Deep and autonomous Research used successful mocked provider responses. The ten-minute scenario advances the clock and serializes/reopens local state. Chromium separately checks real IndexedDB reload, navigation, local countdown, and the 12-minute and 24-minute regeneration transitions. Research recovery uses persisted browser receipts or a signed evaluation checkpoint. A response lost before it reached the browser cannot be recovered from a server cache, and an unknown search dispatch is not automatically repeated.

The payment rows come from `node tests/payment-lite-metrics.cjs`. It exercises the actual payment handlers, Redis adapter, and two worker passes with a deterministic mocked Redis executor and mock chain. Each MGET or MSET is one command. Counts include Lua's nested Redis operations and count EVAL wrappers separately. Bytes sum Redis REST JSON bodies in both directions. Headers, transport overhead, health probes and price/RPC network traffic are outside those byte counts. Provider-specific billing and the previous production bandwidth measurement cannot be inferred from these fixtures.

| Operation | Redis reads | Redis writes | Total | Redis JSON bytes |
|---|---:|---:|---:|---:|
| Talk | 0 | 0 | 0 | 0 |
| Teach | 0 | 0 | 0 | 0 |
| Deep | 0 | 0 | 0 | 0 |
| Autonomous Research and local Research recovery | 0 | 0 | 0 | 0 |
| Local Energy regeneration | 0 | 0 | 0 | 0 |
| Navigation | 0 | 0 | 0 | 0 |
| Reload with cached wallet | 0 | 0 | 0 | 0 |
| Ten-minute ordinary usage scenario | 0 | 0 | 0 | 0 |
| Deposit wallet initialization | 3 | 6 | 9 | 2,672 |
| Opening checkout with reusable authentication | 4 | 9 | 13 | 5,348 |
| Checking unpaid payment | 1 | 4 | 5 | 1,529 |
| Successful payment, wallet GET/POST and check | 8 | 14 | 22 | 19,525 |
| Sweep recovery, including a lost broadcast response | 23 | 6 | 29 | 34,827 |

Payment total in this fixture was 78 nested reads/writes, 25 EVAL wrappers, 52 REST calls and 63,901 JSON bytes. The idle worker has no repeated queue reads. Its liveness checks consist of a probe publish and one heartbeat write per successful round trip, currently every 45 seconds, separately from gameplay.

## Remaining AI safeguards and limitations

Browser Energy is a gameplay rule. A caller who directly invokes the public AI endpoints can bypass it. Payload validation, allowed model configuration, timeouts, existing process-local rate and concurrency limits, and existing Research tool ceilings remain in place. A separately configured infrastructure firewall or rate limit can help against bursts. A separately scoped provider project with spend alerts and a verified hard stop can limit exposure. Neither can verify local Energy, and process-local limits vary with serverless instances. No persistent usage service or new quota was added.

The reported production Research `RESPONSE_PARSE_ERROR / COMPLETION_INCOMPLETE` remains a separate unverified incident. The offline tests cover receipt and checkpoint recovery, unknown-outcome isolation and valid completions. Production checkout activation, worker connectivity, Redis durability, wallet compatibility and actual Helius verification remain outside this local work.

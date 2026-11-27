# Mainnet payments and Energy

The payment endpoint uses Solana Mainnet through Helius. The browser cannot select a network or supply a mint, price, transaction or fee payer. Construction and broadcast are separate. The mobile wallet receives a legacy Solana Pay Transaction Request, already signed by the treasury, and signs for its SPL token account. Both payments and collection use the treasury as fee payer.

## Required server configuration

Provide these six server-side values in the Mainnet environment.

| Variable | Requirement |
|---|---|
| `HELIUS_API_KEY` | A Mainnet Helius key. Access must include finalized transaction history, signatures, account state, and fee and rent queries. |
| `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | A dedicated database and private write credential. Keep the worker and API on the same ledger. |
| `MIND_TOKEN_MINT` | The exact Mainnet MIND mint. The original SPL Token Program and Pump-style Token-2022 mints with only metadata extensions are supported. Active mint/freeze authorities and transfer-affecting extensions are rejected. |
| `WALLET_PRIVATE_KEY` | A 64-byte Solana keypair as base58 or a JSON byte array. The server derives and verifies the public address. |
| `ENCRYPTION_KEY` | A 32-byte hexadecimal AES key or a JSON keyring keyed by version, such as `v1` and `v2`. Keep old versions while any deposits or operation receipts depend on them. |

The existing AI service configuration is separate and retains its existing names. The payment worker uses these same six payment values in a private process. It has no public sweep endpoint.

## Deposit wallet and recovery

The signed Energy bootstrap returns the wallet address and any current uncredited session. For an existing browser profile, the first load after upgrade does a one-time wallet bootstrap using its saved identity. The public address and active payment reference are cached in IndexedDB. A random Ed25519 keypair belongs to the Mindling and its AES-GCM-sealed key is kept in Redis without an expiry. The highest-priority legacy wallet is the current checkout's wallet, which is recovered and sealed under the Mindling's deposit record. Earlier sessions retain their original encrypted keys and recovery references.

New quotes reuse the receiving wallet and derive its MIND associated token account for the configured token program. Each quote still gets a distinct Solana Pay reference. Use the displayed Solana Pay request to bind the transfer to the quote. Direct transfers without that signed request need operator review. Quotes expire after ten minutes, independently of key retention. An outstanding payment remains checkable when Energy regenerates.

## Quoting and sponsorship

New quotes use a fresh finalized Helius snapshot of the configured mint and its canonical SOL-paired Pump.fun bonding curve or migrated PumpSwap pool. The server checks the known program, derived addresses, account ownership, quote asset, token program, mint decimals, and real vault balances. A completed curve without a usable canonical pool pauses quotes. Other pool types, quote currencies, Mayhem and Cashback variants require separately reviewed support. [Pump program account layouts](https://github.com/pump-fun/pump-public-docs/tree/bc35796/idl)

The proposed launch policy requires a current Pyth Hermes SOL/USD feed with a confidence interval no wider than 1% of the price and chain/oracle observations newer than 90 seconds. It checks buy and sell execution at a $20 reference size, with at most a 5% deviation from spot after applying the on-chain fee ceiling and reserve formula. A 10% deviation from the hourly price anchor, stale slots, and unsupported fee schedules halt new quotes. These checks do not establish that a single pool is manipulation-proof. Review the thresholds, actual liquidity and feed availability before opening checkout.

The server computes the $1.99 amount as a ceiling in exact integer token units using the validated spot reserve ratio and SOL/USD. It locks the amount and price evidence for ten minutes. The conservative depth test is an availability safeguard. The quote itself is a fixed-amount token transfer.
A Solana blockhash can expire earlier. A signed session never receives a replacement payment signature automatically. Keep its session ID to check earlier or late transfers.

Sponsorship accounts for the quoted fee and worst-case ATA rent before the server returns a signed transaction. Caps apply per wallet, per owner and across the treasury. Fees and rent remain charged to the sponsor's exposure accounting after ambiguous outcomes. The worker may rebroadcast identical sweep bytes while valid, at most three broadcasts. A new signature requires a finalized failure of the preceding transaction, with at most three attempts. An unresolved expired sweep remains in review.

## Ledger and activation

Checkout requires an audited operator approval and a heartbeat from the supervised payment worker. Before accepting real customers, verify the actual Redis configuration, including concurrent CAS, replica failover, acknowledged-write survival and restore from backups. A successful mocked CAS does not establish these guarantees. If they cannot be established, use a more durable journal before opening payments.

Run the payment worker as a supervised service on a trusted host. Its `--watch` mode examines stored signed checkouts and sweep jobs. It resumes after interruption and never needs the customer to reopen the page. Do not run the worker with funded production credentials before activation approval. Monitor queue age, review jobs, treasury exposure, fee payer balance and the worker heartbeat. Keep the previous encryption keyring versions available for every unresolved deposit and settlement.

The private admin entry point accepts the following operations.

- `pause` prevents new quote, signature, credit and broadcast decisions.
- `audit` checks the linked journal against a separately retained checkpoint and reconciles newly credited and finalized sweep events with finalized Helius data. Its manifest identifies a `reference` and a `previous` head object with `sequence`, `key` and `hash`. Use `previous: null` and `genesis: true` only for a genuinely empty initial history. Retain the returned head separately from Redis.
- `open` performs the same audit and requires explicit manifest attestations `durabilityVerified`, `workerReady`, `walletReviewed`, `sponsorReviewed`, `energyReviewed`, `marketReviewed` and `activationApproved`. These are operator approvals, not evidence generated by the command. Existing approvals retain their original expiry. An audited approval issued by the updated command remains in effect until paused. New quotes and sponsored signatures require a payment worker heartbeat within the preceding two minutes. Re-audit after a suspected failover, restore or change to custody configuration.
- `review-legacy` binds a reviewed higher stage to the full owner fingerprint and an exact hash of the submitted legacy history. Its manifest contains `fingerprint`, `reference`, the exact `legacy` object (`stage`, `createdAt`, `stages`), reviewed `enteredAt` and bounded `stageXP`, and up to 30 distinct hashed `milestones`. Review evidence from a separate trusted source before approving a stage. Unreviewed histories remain available locally for display.

Pause after any failover, suspected rollback or restore. Compare the restored head against the independently retained checkpoint and account for any lost interval before reopening. Paired Redis state and its in-database fence can roll back together, so a matching fence alone does not prove absence of loss. Verify the chosen external retention procedure before buying or accepting funds.

Energy authorization reserves capacity before dispatch, then uses a stored authorization to bind the local integration and the server debit. An unexpected local outcome remains held for review. Existing legacy bonus balances are not minted into server Energy without independent evidence. Local Life and some canonical decisions, such as supporting evidence whose complete publisher history exists only on the browser, cannot be independently reconstructed by the current server from its bounded evidence projection. Verify these cases and the corresponding review workflow before routine use.

Before a real checkout, validate the configured mint and its market under the rules above, supported mobile wallets, live custody and worker procedures, late-payment support, and the $1.99 economics. Automated tests use mock Helius, quote and Redis responses. They do not exercise funded transactions or prove wallet compatibility.

See [Payment Lite verification](payment-lite-verification.md) for the reproducible command-count workload and remaining production checks.

# Solana / $MIND architecture — no live payment implementation

Solana is the selected network; $MIND is a planned SPL token. A mint address, token program, decimal count, trusted price source and deployment network have not been selected/configured here. No on-chain operation is implemented or claimed.

## Ownership and key custody

Player identity is stable across Mindling lifecycles. Keep the player/vault database and backup independently versioned from active Mindling state and death tombstones. Replacing or deleting a Mindling must never delete a wallet, keys, token accounts or balances. Existing P-256 Mindling identity keys are not Solana wallet keys and must not be migrated into this role.

A future embedded wallet may generate an Ed25519 seed locally from `crypto.getRandomValues`, using a maintained audited Solana signing/derivation library. Do not write raw secrets into localStorage or unencrypted IndexedDB, telemetry, crash reports, prompts or Gemini payloads. Prefer a reviewed embedded wallet provider/passkey/MPC design if it materially improves recovery and custody, without requiring Phantom or another external wallet. Evaluate custody and vendor dependence explicitly.

For local custody, encrypt a versioned seed vault with AES-256-GCM, a fresh 96-bit nonce per encryption and authenticated metadata (player ID, public key, network, format). Derive the wrapping key using an audited Argon2id implementation with calibrated memory/time parameters and a random salt; a reviewed PBKDF2 fallback needs device-specific cost testing. Never persist the unlocked wrapping key. Password strength and offline guessing matter. Keep decrypted material short-lived and lock on explicit user action/inactivity; clearing JavaScript variables is not guaranteed memory erasure.

A nonextractable WebCrypto key alone does not defeat XSS: malicious same-origin code can request signatures. Use a narrow CSP, audited/bundled dependencies, no arbitrary HTML insertion, no third-party analytics around the vault, explicit signing confirmation, minimal extensions/provider surface and an external security review before custody. The existing dynamically imported Three.js dependency should be bundled/pinned and included in that review before real wallets are enabled.

## Recovery before deposits

Choose a single documented recovery format and derivation path (if mnemonic-based, explicitly test Solana path compatibility such as `m/44'/501'/0'/0'`; do not assume all wallets use the same path). Support encrypted export plus a safe recovery flow. Require the user to restore the backup in an isolated fresh profile/device and verify the same public key before enabling deposit UI. Provide clear warnings about lost passwords, browser data clearing, private browsing and device loss. No custodial recovery service may be implied unless actually provided.

Deletion/reset must explain that an unbacked-up local vault can be irrecoverably lost. Device migration should import the encrypted backup, verify ownership and public-key equality, and not silently create a new address. Key rotation, compromised-device recovery and multiple active device signing need a reviewed threat model. This milestone creates **no keys or recovery mechanism**, so **real deposits remain disabled**.

## Token accounts and fees

A Solana wallet public key is not the SPL token account itself. Derive/verify the associated token account from owner + $MIND mint + the selected token program; confirm the mint and decimals on chain. Account creation may require rent-exempt SOL. Every transaction needs SOL for fees (and possibly priority fees); a $MIND balance alone is insufficient. Define who funds fees/account rent before enabling top-ups. Reject unexpected token-program extensions/freeze/delegate behavior until reviewed.

## USD 1.99 quotes

Use a server-issued, signed quote intent with player/public key, exact mint/network/program, token amount in base units, USD price and price timestamp, decimals, fee/rent estimate, expiry and a unique purchase ID. Never perform money arithmetic with binary floats. Round token units up deterministically for USD 1.99 and show the quote/fees for explicit confirmation.

A reliable $MIND feed is a launch prerequisite, not assumed to exist. Evaluate an independent oracle feed with confidence/staleness checks, corroborated by sufficiently liquid market data/TWAP. Reject thin/manipulable markets, stale feeds, excessive confidence intervals or > configured price deviation. A single DEX spot quote is not adequate pricing authority. Minimum liquidity, deviation threshold, confirmation delay and expiry need adversarial testing. If a valid feed does not exist, keep purchases disabled.

The preview uses a fixed USD .10 fixture, six decimals, at least USD 100,000 fixture liquidity, 1% price-deviation bound and 60 **virtual** seconds. These constants are test data, not assertions about a real $MIND market.

## Burn verification and exactly-once Energy

Deposits never burn automatically. Only explicitly purchased Energy may cause a burn. A real future flow must construct a verifiable SPL `BurnChecked` transaction for the correct mint, owner-authorized source token account, decimals and exact quote amount. Include a verifiable intent association; never accept a client-supplied “paid” boolean as proof.

The server must independently fetch confirmed/finalized transaction metadata, verify network, signature, success status, signers, token program/mint/source/amount and intended purchase. Enforce a durable unique index on transaction signature + instruction index and the quote/purchase ID. Commit verified receipt and Energy entitlement atomically, then reconcile IndexedDB display with the authoritative entitlement. An idempotent retry must not duplicate credits. Local IndexedDB alone cannot protect real monetary credits against editing/replay.

Handle expired quotes, reverted/failed instructions, pending finality, insufficient SOL, RPC outages and disagreeing RPC providers as pending/failure, not successful purchases. Use a durable outbox/reconciliation worker for a verified burn whose credit commit failed. Define a customer-visible recovery policy for irreversible burns with interrupted crediting. A dead Mindling cannot receive revival through a purchase; reserve/validate the target lifecycle before signing and specify credit handling if it dies while settlement is pending. Assets remain owned by the player regardless.

## Reference specifications for implementation review

- Solana token accounts / associated accounts: https://solana.com/docs/tokens/basics/create-token-account
- Solana burn instructions: https://solana.com/docs/tokens/basics/burn-tokens
- Solana transaction fees: https://solana.com/docs/core/fees
- WebCrypto AES-GCM and authenticated encryption: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
- OWASP browser storage and XSS guidance: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

These are design references, not evidence that wallet custody, recovery or on-chain payment verification has been implemented or audited.

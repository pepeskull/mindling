# Preview Gemini configuration and production activation

The user chose to configure credentials later. No credentials were supplied, stored in source, or used for a live Gemini test.

## Vercel Preview environment only

Configure these secret/server variables for a **Preview deployment**, then redeploy:

| Variable | Purpose |
|---|---|
| `MINDLING_PREVIEW_AI_ENABLED=1` | Explicit endpoint gate; otherwise 503 |
| `GEMINI_API_KEY` | Google AI API key authorized for Gemini and embeddings; restrict/quota it |
| `PREVIEW_ACCESS_TOKEN` | High-entropy random developer access token, separate from the API key |
| `PREVIEW_ORIGIN` | Exact browser origin of that preview deployment, e.g. `https://your-preview.vercel.app`, no trailing slash |
| `UPSTASH_REDIS_REST_URL` | Dedicated HTTPS Redis REST endpoint for preview rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only limiter credential |

Do not use `NEXT_PUBLIC_`, client bundles, localStorage, commits or chat for the Gemini key. Enter only the separate preview access token in the sandbox's password field; the application keeps it in that page's DOM and clears it on navigation. Anyone with this token can incur bounded Gemini costs; rotate it and scope deployments accordingly. Avoid sharing the preview access token publicly.

The endpoint is `POST /api/preview-learning`, accepts only JSON `{text, pathway}`, limits input to 2,000 characters, and requires exact Origin plus bearer token. No production records, old memories, identity traits or conversations are sent. Both model analysis and embedding receive the explicitly submitted content. Explain Google's processing/retention policy to testers before they submit private content.

Persistent atomic limiter: six authorized requests/minute, 200/day across the whole test deployment. It fails closed when unconfigured/unavailable. Limits are global, not bypassable by forging IP headers. They are conservative developer limits, not a production multi-user allocation scheme. Gemini timeouts/errors and malformed responses return safe errors; content, keys and model responses are not logged by this code. Check platform/provider logging and retention separately.

Pinned requests use `gemini-2.5-flash:generateContent` with a response schema and `gemini-embedding-001:embedContent` with 768 dimensions. Availability/billing must be verified in the chosen Google project; do not silently substitute an untested model.

## Required live test after configuration

1. Open `/?stage-preview=1` on the exact allowed origin; create a fresh test identity and enter the preview access token.
2. Submit a meaningful non-private fact with “Analyze with Gemini”. Verify an actual 200 response, GEMINI provenance, one memory, deterministic XP and one Energy charge.
3. Advance one virtual hour; paraphrase the same fact. Verify local semantic duplicate rejection without another award.
4. Test a distinct fact, malformed schema fixtures, wrong token, rate limit, missing key and provider failure. Confirm no learning/energy mutation on failure.
5. Compare all production database records before/after and test the normal root route separately.
6. Record the deployment/model/date and results. Until this is done, Gemini integration is **not live-verified**.

## Production activation checklist — separate explicit approval required

- Keep new mechanics behind the preview URL; keep the AI gate absent in Production until a separately approved rollout.
- Resolve the legacy “api directory must not exist” test contract explicitly without weakening unrelated canonical/data/payment invariants.
- Review progression/XP and the documented slower-decay/neural-reserve balancing decision with users.
- Complete real Gemini privacy, abuse, cost, quality, language and adversarial duplicate tests; move award authority server-side for production if anti-cheat matters.
- Complete versioned additive production migration, exports, backups, blocked-upgrade and rollback tests. Never import preview records.
- Audit dependency supply chain, XSS/CSP, auth, endpoint origins, quotas and serverless runtime on a deployed preview.
- Implement/audit wallet recovery and verified restore before displaying any real deposit address.
- Implement independently verified on-chain payment/burn receipts, durable exactly-once crediting and reconciliation before real payments.
- Run production lifecycle/death consent and wallet-preservation tests on migration copies.
- Obtain explicit production activation approval; this PR does not grant it.

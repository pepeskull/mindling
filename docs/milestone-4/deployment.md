# Native learning deployment

The external learning endpoints and provider clients have been removed. Vercel serves the existing application; `/api/learning` and `/api/preview-learning` return 410. Normal gameplay needs no learning API token. Stage Preview Teach/Deep Training now uses the separate server learning service; see [current configuration and memory intelligence](../preview-memory-intelligence.md). Production learning uses native JavaScript and the existing local IndexedDB transaction.

After this change is deployed, these obsolete environment variables may be removed manually from environments dedicated to this application:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `GEMINI_API_KEY`
- `MINDLING_AI_ENABLED`, `MINDLING_PREVIEW_AI_ENABLED`
- `MINDLING_ORIGIN`, `PREVIEW_ORIGIN`, `PREVIEW_ACCESS_TOKEN`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — only if not shared with another application or service. In this repository their only consumer was the removed inference limiter.

No environment values were read, printed or changed during migration. The removed origin/signature/replay/rate-limit mechanisms belonged to the deleted server inference endpoints. Local player identity creation and stored keys, atomic journal replay protection, lifecycle/tombstone guards, production/preview database isolation, static deny routes and simulated wallet protections remain.

See [native learning architecture and limitations](../semantic-models.md). The previous milestone's deployment and live-provider activation instructions no longer apply. This change has source/diff review only, not executed runtime or regression verification.

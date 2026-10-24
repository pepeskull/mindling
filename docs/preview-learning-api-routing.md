# Stage Preview learning API routing repair

## Cause and request path

The repository is a zero-config static site with a Node API, not a framework router. The browser's `requestLearningAssessment` already sends same-origin JSON **POST** to `/api/mindling/learn` for Teach and Deep Training. Its request path and method are correct.

The API entry was `api/mindling/learn.cjs`, exporting the existing `src/server/mindling-learning.cjs` handler with `module.exports`. The export is correct for CommonJS. The extension is not: Vercel's zero-config Node discovery matches `api/**/*.+(js|mjs|ts|tsx)` and does not match `.cjs`. See the [official detector source](https://github.com/vercel/vercel/blob/c628be7835e03a965b93e9cf9e2bd5ac2acbf5eb/packages/fs-detectors/src/detect-builders.ts#L690).

Using published `@vercel/fs-detectors@7.11.0`, the original file list produces **no Node API function**. Renaming the unchanged entry to `api/mindling/learn.js` produces an `@vercel/node` builder and an extensionless API route. `@vercel/node@27.0.1` also successfully builds a Node 24 Lambda containing the entry, the original server handler and its dynamically imported decision-schema dependencies. Running the compiled export accepts POST with a mocked assessment and rejects unsupported methods.

`vercel.json` correctly checks the filesystem before the final rewrite to `/index.html`. Its preceding rules only retire the two old endpoints or deny private/development paths; none matches `/api/mindling/learn`. With no discovered function, the API path falls through to the static SPA target, which explains the reported Vercel/static HTTP 405. No routing configuration change is needed once the API entry is discoverable.

The application handler only returns its own 405 when `request.method !== 'POST'`, with JSON `{ "service": "mindling-learning-service", "error": { "code": "METHOD_NOT_ALLOWED" } }`. POST reaches request validation (400), configuration validation (503), or assessment handling; it does not take that method-rejection branch. The added tests distinguish these responses from a static routing failure.

## Observed deployment evidence and limits

GitHub's Vercel production deployment for main commit `50dbfed22aee37163671458aa4fa3c8e5e355c05` reports successful deployment. This confirms publication completed, not that an API function was discovered. Runtime deployment logs were not available through the connected tools or existing Vercel credential bindings.

Direct GET and invalid-body POST requests to `https://mindling.vercel.app/api/mindling/learn` were blocked by the cloud environment's egress proxy with **CONNECT 403**, before reaching Vercel. Consequently the deployed 405 body/headers could not be inspected independently. The root cause is reproduced and verified with official Vercel discovery/build tooling and actual exported-handler HTTP tests; this is not a claim that the repaired deployment has already been tested live.

## Minimal fix and preserved behavior

Only the API entry filename changes, `.cjs` → `.js`; its CommonJS export and internal `.cjs` server module are unchanged. No changes to frontend requests, `vercel.json`, `SERVICE_API`, `SERVICE_MODEL`, model selection, memory intelligence, IndexedDB, Energy, XP, Stage Preview isolation or production gameplay are necessary. No repository package/dependency declarations are added.

After deploying the fix, verify the function appears in Vercel's Functions list. The project must deploy the repository root containing `api/` and use normal Vercel function detection, rather than publishing only a separately selected static-output directory. No new build command, rewrite, runtime override, secret or environment variable is required by this repair. Existing server-only `SERVICE_API` and `SERVICE_MODEL` requirements remain; missing configuration should yield neutral 503, not routing 405. Luna/model compatibility remains a separate unverified concern and no paid model calls are made here.

An invalid-body smoke request safely exercises routing and request validation without model inference:

```sh
curl -i -X POST https://mindling.vercel.app/api/mindling/learn \
  -H 'Content-Type: application/json' --data '{}'
# Expected after deployment: HTTP 400 JSON, error.code = REQUEST_INVALID.

curl -i https://mindling.vercel.app/api/mindling/learn
# Expected after deployment: HTTP 405 JSON, error.code = METHOD_NOT_ALLOWED.
```

Use the PR preview hostname instead of the production hostname to verify before merging. The repair task does not merge or manually deploy. The existing GitHub integration may build a preview automatically when the branch is pushed.

## Automated regression tests

From the checkout root:

```sh
node --test tests/*.test.mjs
```

`tests/learning-api-route.test.mjs` tests the actual exported API function through HTTP: invalid-body POST reaches validation, valid-body POST without configuration returns 503, GET/HEAD/PUT/PATCH/DELETE/OPTIONS return application 405, and the real frontend request helper receives a valid assessment through the entrypoint with provider requests mocked. Existing topology/isolation invariants reference the new entry filename. The HTTP harness supplies Vercel's `request.body` and response helpers; it does not pretend to emulate the entire Vercel router.

The optional official-tooling regression separately checks real function discovery, existing route precedence, Lambda compilation, inclusion of dynamic imports and the compiled export. Install its pinned tooling outside the repository:

```sh
VERCEL_TOOLING_ROOT=$(mktemp -d /tmp/mindling-vercel-tooling-XXXXXX)
export VERCEL_TOOLING_ROOT
npm install --prefix "$VERCEL_TOOLING_ROOT" --no-audit --no-fund \
  @vercel/fs-detectors@7.11.0 @vercel/node@27.0.1
node tests/vercel-learning-route.mjs
```

This tooling may warn that it compiles existing ES modules to CommonJS; the compiled-export test verifies those traced dependencies work. No project module-type change is needed. Automated inference is fully mocked and never paid.

Validated in this cloud instance: all 158 Node tests passed with zero failures/skips; the official discovery/build/compiled-export regression passed; the real IndexedDB and actual sandbox controller regressions passed. Live deployed routing remains unverified because the egress proxy denied the deployment host.

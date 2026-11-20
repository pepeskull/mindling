// The hosted tool budget is independent of retained sources and model calls.
export const MAX_WEB_SEARCH_CALLS = 4;
const LEGACY_WEB_SEARCH_CALLS = 2;
const HISTORICAL_SOURCE_REQUESTS = 3;

export function validWebSearchCallCount(count) {
  return Number.isSafeInteger(count) && count >= 1 && count <= MAX_WEB_SEARCH_CALLS;
}

export function webSearchLimit(task) {
  return task.searchToolLimit ?? LEGACY_WEB_SEARCH_CALLS;
}

// Pre-hosted research used a different source counter. Keep its saved rows
// readable without giving any of them a larger hosted-search authorization.
export function storedSourceRequestLimit(task) {
  if (task.searchToolLimit === undefined) return HISTORICAL_SOURCE_REQUESTS;
  return webSearchLimit(task);
}

export function remainingWebSearchCalls(task) {
  return Math.max(0, webSearchLimit(task) - (task.sourceRequests || 0));
}

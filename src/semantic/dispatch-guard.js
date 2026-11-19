// A short lease covers the existing 45-second transport timeout across tabs.
export function reserveSemanticDispatch(mind, owner, now = Date.now()) {
  if (mind.semanticDispatch?.until > now) return false;
  mind.semanticDispatch = { owner, until: now + 60000 };
  return true;
}

export function settleSemanticDispatch(mind, owner, failed = false) {
  if (mind.semanticDispatch?.owner !== owner) return;
  if (failed) mind.semanticDispatch.until = Date.now() + 60000;
  else delete mind.semanticDispatch;
}

export function formatLifePercentage(value) {
  return Number.isFinite(value) ? `${Math.round(Math.max(0, Math.min(100, value)))}%` : '—';
}

export function formatLifePercentage(value) {
  return Number.isFinite(value) ? `${Math.round(Math.max(0, Math.min(100, value)))}%` : '—';
}

export function formatCareCooldown(expiresAt, now) {
  const seconds = Math.ceil((expiresAt - now) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds <= 0) return 'Ready!';
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(unit => String(unit).padStart(2, '0')).join(':');
}

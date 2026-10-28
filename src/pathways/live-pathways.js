// Read-only names and selection over graphData's canonical, uncollapsed counts.
// These orientations never contribute specialization evidence or credentials.
const titles = new Map([
  ['science', 'Scientist'], ['sports', 'Sports Analyst'],
  ['technology', 'Technologist'], ['finance', 'Financial Analyst'],
  ['art', 'Creative Artist'], ['history', 'Historian'],
  ['mathematics', 'Mathematician'], ['medicine', 'Medical Researcher'],
  ['music', 'Music Specialist'], ['literature', 'Literary Analyst'],
  ['programming', 'Developer'], ['engineering', 'Engineer']
]);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const readable = label => typeof label === 'string' ? label.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/gu, ' ').trim().slice(0, 120) : '';
const technical = /^(?:(?:area|category|topic|memory):|(?:(?:area|category|topic|memory)[_-])?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$)/i;
const unformed = /^(?:uncategorized|unclassified claims?|unsorted memories|other areas|emerging knowledge(?: \d+)?)$/i;

export function pathwayTitle(label) {
  const area = readable(label);
  // Native Notes: labels remain neutral even when their excerpt is a domain.
  const subject = area.replace(/^notes:\s*/i, '').trim();
  if (!subject || technical.test(subject) || unformed.test(subject)) return null;
  return titles.get(area.toLocaleLowerCase('en')) || `Knowledge: ${subject}`;
}

export function livePathways(distribution = []) {
  // Fixed count/identity ordering survives hydration and avoids a mutable
  // incumbent registry. A tie never depends on label, input order or UI state.
  return distribution.filter(area => area.count > 0 && pathwayTitle(area.label))
    .slice().sort((a, b) => b.count - a.count || compare(a.id, b.id)).slice(0, 3)
    .map(area => ({ id: area.id, title: pathwayTitle(area.label), area: readable(area.label), count: area.count, share: area.share }));
}

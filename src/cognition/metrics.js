import { CRITERIA, OUTCOMES } from '../training/contract.js';

// Descriptive observations only. Never a proficiency or intelligence score.
export function evaluationMetrics(record) {
  const result = record.result;
  const statuses = CRITERIA.map(key => result.evaluation.criteria[key].status);
  const retrieved = result.selection.memoryIds.length;
  const referenced = result.reasoning.memoryIds.length;
  return {
    evaluationId: record.id, mindlingId: record.mindlingId, at: record.at,
    outcome: result.outcome, candidateMemories: record.context.candidates.length,
    availableCurrentMemories: record.context.totalCurrent,
    retrievedMemories: retrieved, directlyReferencedMemories: referenced,
    memoryCoverage: { referenced, retrieved, fraction: retrieved ? referenced / retrieved : null },
    criteria: { passed: statuses.filter(status => status === 'met').length,
      applicable: statuses.filter(status => status !== 'not_applicable').length,
      failed: statuses.filter(status => status === 'not_met').length,
      unclear: statuses.filter(status => status === 'unclear').length },
    uncertainty: result.reasoning.uncertainty,
    insufficientInformation: result.reasoning.insufficientInformation,
    contextVersion: record.context.version, model: result.model
  };
}

export function cognitiveMetrics(history) {
  const retained = (history?.records || []).map(evaluationMetrics).sort((a, b) => a.at - b.at || a.evaluationId.localeCompare(b.evaluationId));
  const uncertainty = { low: 0, moderate: 0, high: 0 };
  for (const item of retained) uncertainty[item.uncertainty]++;
  return {
    mindlingId: history?.mindlingId ?? null,
    completed: history?.totals?.completed ?? 0,
    outcomes: Object.fromEntries(OUTCOMES.map(outcome => [outcome, history?.totals?.[outcome] ?? 0])),
    retainedCount: retained.length, retained, uncertainty,
    latest: retained.at(-1) || null,
    comparison: retained.length < 2 ? null : { previous: retained.at(-2), latest: retained.at(-1) }
  };
}

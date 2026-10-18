import { TYPE_LABELS } from './evaluation.js';

export const NLI_PROFILE = Object.freeze({
  key: 'original-information-type-v1',
  hypothesisTemplate: 'This text is {}.',
  scoring: 'softmax over entailment logits across candidate labels',
  qualified: false,
  qualificationReason: 'NLI_INFORMATION_TYPE_UNQUALIFIED',
  candidates: Object.freeze(Object.entries(TYPE_LABELS).map(([type, label]) => Object.freeze({
    type, label, hypothesis: `This text is ${label}.`,
  }))),
});

export function resolveNliLabelMapping(config) {
  const entries = Object.entries(config?.label2id || {}).map(([label, index]) => [label.toLowerCase(), Number(index)]);
  const mapping = Object.fromEntries(entries);
  const value = {
    entailment: mapping.entailment,
    neutral: mapping.neutral,
    contradiction: mapping.contradiction ?? mapping.not_entailment,
  };
  if (!Object.values(value).every(Number.isInteger) || new Set(Object.values(value)).size !== 3) throw new Error('NLI_LABEL_MAPPING_INVALID');
  return value;
}

export function softmax(values) {
  if (!Array.isArray(values) || !values.length || values.some(value => !Number.isFinite(value))) throw new Error('NLI_SCORES_INVALID');
  const maximum = Math.max(...values);
  const exponentials = values.map(value => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => value / total);
}

export function scoreNliCandidates(rows, mapping) {
  if (!Array.isArray(rows) || rows.length !== NLI_PROFILE.candidates.length) throw new Error('NLI_ROWS_INVALID');
  const scores = softmax(rows.map(row => row.logits?.[mapping.entailment]));
  const candidates = rows.map((row, index) => ({
    type: row.type,
    label: row.label,
    hypothesis: row.hypothesis,
    tokenCount: row.tokenCount ?? null,
    logits: {
      entailment: row.logits[mapping.entailment],
      neutral: row.logits[mapping.neutral],
      contradiction: row.logits[mapping.contradiction],
    },
    score: scores[index],
  })).sort((left, right) => right.score - left.score);
  const entropy = -scores.reduce((sum, score) => sum + (score > 0 ? score * Math.log(score) : 0), 0);
  return {
    candidates,
    labels: candidates.map(item => item.label),
    scores: candidates.map(item => item.score),
    top: candidates[0],
    uncertainty: {
      topTwoMargin: candidates[0].score - candidates[1].score,
      normalizedEntropy: entropy / Math.log(scores.length),
      qualified: false,
      reason: NLI_PROFILE.qualificationReason,
    },
  };
}

export function nliClassificationMetrics(cases, predictions, types = NLI_PROFILE.candidates.map(item => item.type)) {
  if (!Array.isArray(cases) || !Array.isArray(predictions) || cases.length !== predictions.length) throw new Error('NLI_METRICS_INPUT_INVALID');
  const index = new Map(types.map((type, position) => [type, position]));
  const confusion = types.map(() => types.map(() => 0));
  cases.forEach((item, position) => {
    if (!index.has(item.expected) || !index.has(predictions[position])) throw new Error('NLI_METRICS_LABEL_INVALID');
    confusion[index.get(item.expected)][index.get(predictions[position])] += 1;
  });
  const perCategory = Object.fromEntries(types.map((type, position) => {
    const truePositive = confusion[position][position];
    const actual = confusion[position].reduce((sum, value) => sum + value, 0);
    const predicted = confusion.reduce((sum, row) => sum + row[position], 0);
    const precision = predicted ? truePositive / predicted : 0;
    const recall = actual ? truePositive / actual : 0;
    return [type, { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, support: actual }];
  }));
  const correct = confusion.reduce((sum, row, position) => sum + row[position], 0);
  return { types, confusion, perCategory, accuracy: cases.length ? correct / cases.length : null, count: cases.length };
}

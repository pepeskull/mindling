export const CONCEPT_MATCHING = Object.freeze({
  contentThreshold: 0.72,
  maximumMatchedVariants: 5,
  weights: Object.freeze({ anchors: 0.45, terms: 0.3, relations: 0.2, rawTokens: 0.05 })
});

// Modal auxiliaries describe how an utterance is phrased, not the object/action
// pair used by the conservative concept matcher. Original content is retained.
const FUNCTION_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "can", "could", "for", "from", "i", "in", "is", "it", "may", "might", "must", "of", "on", "shall", "should", "that", "the", "this", "to", "we", "will", "with", "would", "you"]);
const RELATIONS = new Set(["enjoy", "hate", "learn", "like", "love", "play"]);
const NEGATIONS = new Set(["no", "not", "never"]);
const OPPOSITES = [["enjoy", "hate"], ["like", "hate"], ["love", "hate"]];

export const normalizeContent = value => value.normalize("NFKC").toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

function normalizeTerm(term) {
  if (term.length <= 3) return term;
  let normalized = term;
  if (term.endsWith("ies") && term.length > 4) normalized = `${term.slice(0, -3)}y`;
  if (term.endsWith("ing") && term.length > 5) {
    const base = term.slice(0, -3);
    normalized = base.endsWith(base.at(-1).repeat(2)) ? base.slice(0, -1) : base;
  }
  else if (term.endsWith("ed") && term.length > 4) normalized = term.slice(0, -2);
  else if (term.endsWith("s") && !term.endsWith("ss") && term.length > 4) normalized = term.slice(0, -1);
  return [...RELATIONS].find(candidate => normalized.length >= 5 && candidate[0] === normalized[0] && editDistance(normalized, candidate) <= 1) || normalized;
}

export function extractConcept(content) {
  const normalizedContent = normalizeContent(content);
  const rawTokens = [...new Set(normalizedContent.split(" ").filter(Boolean))];
  const terms = [...new Set(rawTokens.filter(token => !FUNCTION_WORDS.has(token)).map(normalizeTerm))];
  const relations = terms.filter(term => RELATIONS.has(term));
  const anchors = terms.filter(term => !RELATIONS.has(term) && !NEGATIONS.has(term));
  return { normalizedContent, rawTokens, terms, anchors, relations, negated: terms.some(term => NEGATIONS.has(term)) };
}

function editDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, row) => {
    const values = Array(right.length + 1).fill(0); values[0] = row; return values;
  });
  for (let column = 0; column <= right.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) for (let column = 1; column <= right.length; column += 1) {
    const cost = left[row - 1] === right[column - 1] ? 0 : 1;
    rows[row][column] = Math.min(rows[row - 1][column] + 1, rows[row][column - 1] + 1, rows[row - 1][column - 1] + cost);
    if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) rows[row][column] = Math.min(rows[row][column], rows[row - 2][column - 2] + 1);
  }
  return rows[left.length][right.length];
}

const equivalentTerm = (left, right) => left === right || (left.length >= 5 && right.length >= 5 && left[0] === right[0] && Math.abs(left.length - right.length) <= 1 && editDistance(left, right) <= 1);

function fuzzyOverlap(left, right) {
  const remaining = [...right]; let shared = 0;
  for (const term of left) {
    const index = remaining.findIndex(candidate => equivalentTerm(term, candidate));
    if (index >= 0) { shared += 1; remaining.splice(index, 1); }
  }
  return left.length + right.length - shared ? shared / (left.length + right.length - shared) : 0;
}

function conflicts(left, right) {
  if (left.negated !== right.negated && fuzzyOverlap(left.anchors, right.anchors) > 0) return true;
  return OPPOSITES.some(([positive, negative]) =>
    left.relations.includes(positive) && right.relations.includes(negative) || left.relations.includes(negative) && right.relations.includes(positive));
}

export function compareConcepts(leftInput, rightInput) {
  const left = leftInput.terms ? leftInput : extractConcept(leftInput);
  const right = rightInput.terms ? rightInput : extractConcept(rightInput);
  if (left.normalizedContent === right.normalizedContent) return { type: "EXACT_MATCH", score: 1 };
  const anchorScore = fuzzyOverlap(left.anchors, right.anchors);
  if (conflicts(left, right) || (left.anchors.length && right.anchors.length && anchorScore === 0)) return { type: "NO_MATCH", score: 0 };
  const relationScore = fuzzyOverlap(left.relations, right.relations);
  const exactAnchors = left.anchors.some(anchor => right.anchors.includes(anchor));
  if (anchorScore > 0 && !exactAnchors && relationScore === 0) return { type: "NO_MATCH", score: 0 };
  const score = anchorScore * CONCEPT_MATCHING.weights.anchors + fuzzyOverlap(left.terms, right.terms) * CONCEPT_MATCHING.weights.terms +
    relationScore * CONCEPT_MATCHING.weights.relations + fuzzyOverlap(left.rawTokens, right.rawTokens) * CONCEPT_MATCHING.weights.rawTokens;
  return { type: score >= CONCEPT_MATCHING.contentThreshold ? "CONTENT_MATCH" : "NO_MATCH", score };
}

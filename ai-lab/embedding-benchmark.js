const item = (id, topic, intent, text, repeatOf = null) => Object.freeze({ id, topic, intent, text, repeatOf });

// Expectations are consumed only after inference. They are never included in model input or prompts.
export const EMBEDDING_BENCHMARK = Object.freeze([
  item('F1', 'finance', 'AMBITION', 'I want to become a successful stock trader.'),
  item('F2', 'finance', 'ADVICE', 'You should learn how to invest in stocks.'),
  item('F3', 'finance', 'QUESTION', 'How does the stock market work?'),
  item('F4', 'finance', 'EXPERIENCE', 'Jag förlorade pengar på handel med kryptovalutor i går.'),
  item('P1', 'programming', 'OPINION', 'I think programming is amazing.'),
  item('P2', 'programming', 'AMBITION', 'Jag vill lära mig att programmera.'),
  item('P3', 'programming', 'QUESTION', 'How does a compiler transform source code?'),
  item('P4', 'programming', 'EXPERIENCE', 'Yesterday I fixed a bug in a JavaScript program.'),
  item('A1', 'astronomy', 'FACT', 'The Earth rotates around its axis.'),
  item('A2', 'astronomy', 'QUESTION', 'Why does the Moon orbit the Earth?'),
  item('A3', 'astronomy', 'FACT', 'Jorden kretsar runt solen.'),
  item('A4', 'astronomy', 'OPINION', 'I find distant galaxies fascinating.'),
  item('C1', 'cooking', 'INSTRUCTION', 'Chop the onions before heating the pan.'),
  item('C2', 'cooking', 'QUESTION', 'Hur bakar man ett bröd med surdeg?'),
  item('C3', 'cooking', 'EXPERIENCE', 'I cooked vegetable soup for dinner.'),
  item('C4', 'cooking', 'ADVICE', 'You should season the sauce gradually.'),
  item('N1', 'animals', 'FACT', 'Dolphins are mammals that breathe air.'),
  item('N2', 'animals', 'QUESTION', 'Varför spinner katter?'),
  item('N3', 'animals', 'EXPERIENCE', 'I watched a fox cross the garden.'),
  item('N4', 'animals', 'OPINION', 'Elephants are remarkable animals.'),
  item('R1', 'astronomy', 'FACT', 'The Earth rotates around its axis.', 'A1'),
]);

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function embeddingBenchmarkMetrics(cases, relationship) {
  if (!Array.isArray(cases) || !relationship?.pairs) throw new Error('BENCHMARK_INPUT_INVALID');
  const related = []; const unrelated = []; const crossIntent = [];
  for (const pair of relationship.pairs) {
    const left = cases[pair.from]; const right = cases[pair.to];
    const repeated = left.repeatOf === right.id || right.repeatOf === left.id;
    if (repeated) continue;
    if (left.topic === right.topic) {
      related.push(pair.cosine); if (left.intent !== right.intent) crossIntent.push(pair.cosine);
    } else unrelated.push(pair.cosine);
  }
  let wins = 0; let comparisons = 0;
  for (const positive of related) for (const negative of unrelated) {
    wins += positive > negative ? 1 : positive === negative ? 0.5 : 0; comparisons += 1;
  }
  const values = [...new Set([...related, ...unrelated])].sort((a, b) => a - b);
  const candidates = values.length > 1 ? values.slice(0, -1).map((value, index) => (value + values[index + 1]) / 2) : values;
  let exploratory = null;
  for (const threshold of candidates) {
    const falsePositiveRate = unrelated.filter(value => value >= threshold).length / unrelated.length;
    const falseNegativeRate = related.filter(value => value < threshold).length / related.length;
    const balancedError = (falsePositiveRate + falseNegativeRate) / 2;
    if (!exploratory || balancedError < exploratory.balancedError) exploratory = { threshold, falsePositiveRate, falseNegativeRate, balancedError };
  }
  const repeatedPairs = relationship.pairs.filter(pair => {
    const left = cases[pair.from]; const right = cases[pair.to];
    return left.repeatOf === right.id || right.repeatOf === left.id;
  });
  return {
    relatedPairCount: related.length, unrelatedPairCount: unrelated.length,
    relatedMean: mean(related), unrelatedMean: mean(unrelated), separation: mean(related) - mean(unrelated),
    crossIntentRelatedMean: mean(crossIntent), pairwiseRankingAccuracy: comparisons ? wins / comparisons : null,
    repeated: repeatedPairs.map(pair => ({ cosine: pair.cosine, exactlyEqual: pair.exactlyEqual, maximumAbsoluteDifference: pair.maximumAbsoluteDifference })),
    exploratoryThreshold: exploratory,
    qualification: 'Descriptive in-sample benchmark only. The exploratory threshold is not used for automatic clustering.',
  };
}

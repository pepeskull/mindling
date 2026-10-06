export const SEMANTIC_CALIBRATION_PAIRS = Object.freeze([
  ["You should learn to trade", "You ought to learn trading", "SAME_MEANING"],
  ["You should learn to trade", "You need to learn to trade", "RELATED"],
  ["You should learn to trade", "You have to learn to trade", "RELATED"],
  ["You need to learn to trade", "You have to learn to trade", "SAME_MEANING_OR_RELATED"],
  ["I like trading", "I love trading", "SAME_MEANING"],
  ["I like trading", "I hate trading", "CONFLICTING"],
  ["Trading is easy", "Trading is difficult", "NOT_SAME_MEANING"],
  ["Learn JavaScript", "Study JavaScript programming", "SAME_MEANING"],
  ["Learn JavaScript", "JavaScript is a programming language", "RELATED"],
  ["Learn to play games", "Learn to trade", "NOT_SAME_MEANING"],
  ["The dog is chasing the cat", "The cat is chasing the dog", "NOT_SAME_MEANING"],
  ["John sold the car to Mary", "Mary sold the car to John", "NOT_SAME_MEANING"],
  ["I will trade tomorrow", "I traded yesterday", "NOT_SAME_MEANING"],
  ["I can trade", "I cannot trade", "CONFLICTING"],
  ["Buy three shares", "Buy five shares", "NOT_SAME_MEANING"],
  ["The meeting is on Monday", "The meeting is on Tuesday", "NOT_SAME_MEANING"],
  ["I enjoy playing games", "Playing games is something I enjoy", "SAME_MEANING"],
  ["Learning programming is useful", "It is useful to learn programming", "SAME_MEANING"],
  ["Learn how to trade", "Learn to trade", "SAME_MEANING"]
]);

export const SEMANTIC_GENERALIZATION_PAIRS = Object.freeze([
  ["Although it rained, we continued walking", "We continued our walk despite the rain"],
  ["The package arrived", "The package did not arrive"],
  ["Reserve two seats", "Reserve seven seats"],
  ["Alex called Morgan", "Morgan called Alex"],
  ["The launch happens next week", "The launch happened last week"],
  ["Rain caused the delay", "The delay caused the rain"],
  ["I prefer tea to coffee", "I prefer coffee to tea"],
  ["Mina is able to swim", "Mina is unable to swim"],
  ["Employees are required to attend", "Employees may attend"],
  ["The train might be late", "The train is definitely late"],
  ["If it rains, the match is cancelled", "The match is cancelled"],
  ["Sam gave Lee the key", "Lee gave Sam the key"],
  ["The chef prepared the meal", "The meal was prepared by the chef"],
  ["The teacher praised the student", "The student praised the teacher"],
  ["Maya sent a letter to Noah", "Noah sent a letter to Maya"],
  ["Pack four boxes", "Pack nine boxes"],
  ["The appointment is on Thursday", "The appointment is on Friday"],
  ["The conference is in Oslo", "The conference is in Helsinki"],
  ["I plan to become a pilot", "I am a pilot"],
  ["Write the report", "Write the final report"],
  ["The storm delayed the flight", "The flight was delayed by the storm"],
  ["Please close the window", "Shut the window"]
]);

export const CANONICAL_CONSISTENCY_PAIRS = Object.freeze([
  ["trader-a", "A-B", "Learn how to trade", "Learn to trade", "SAME_MEANING"],
  ["trader-a", "A-C", "Learn how to trade", "Learn to be a trader", "SAME_MEANING"],
  ["trader-a", "B-C", "Learn to trade", "Learn to be a trader", "SAME_MEANING"],
  ["trader-b", "A-B", "Learn to trade", "Learn how to become a trader", "SAME_MEANING"],
  ["trader-b", "A-C", "Learn to trade", "Become a trader", "SAME_MEANING"],
  ["trader-b", "B-C", "Learn how to become a trader", "Become a trader", "SAME_MEANING"],
  ["trader-boundary", "goal-knowledge", "Learn how trading works", "Learn to trade", "NOT_SAME_MEANING"],
  ["trader-boundary", "qualifier", "Become a trader", "Become a better trader", "NOT_SAME_MEANING"],
  ["trader-boundary", "intention-state", "I want to become a trader", "I am a trader", "NOT_SAME_MEANING"],
  ["trader-boundary", "negated-intention", "I want to become a trader", "I do not want to become a trader", "CONFLICTING"],
  ["roles", "sale-active-passive", "John sold the car to Mary", "The car was sold to Mary by John", "SAME_MEANING"],
  ["roles", "sale-reversal", "John sold the car to Mary", "Mary sold the car to John", "NOT_SAME_MEANING"],
  ["roles", "chase-active-passive", "The dog chased the cat", "The cat was chased by the dog", "SAME_MEANING"],
  ["roles", "chase-reversal", "The dog chased the cat", "The cat chased the dog", "NOT_SAME_MEANING"],
  ["entities", "location", "I live in Stockholm", "I live in Gothenburg", "NOT_SAME_MEANING"],
  ["entities", "name-reversal", "Anna called Erik", "Erik called Anna", "NOT_SAME_MEANING"],
  ["entities", "verb-paraphrase", "Anna called Erik", "Anna phoned Erik", "SAME_MEANING"],
  ["clean-slate-b", "want-paraphrase", "I want to learn trading", "I want to learn how to trade", "SAME_MEANING"],
  ["clean-slate-b", "want-need", "I want to learn trading", "I need to learn trading", "RELATED_OR_DISTINCT"],
  ["clean-slate-b", "quantity", "Buy three shares", "Buy five shares", "NOT_SAME_MEANING"],
  ["clean-slate-b", "preference-conflict", "I like trading", "I hate trading", "CONFLICTING"]
]);

export async function runSemanticCalibration(engine) {
  const results = [];
  for (const [left, right, expected] of SEMANTIC_CALIBRATION_PAIRS) {
    const measured = await engine.diagnoseWithEquivalence(left, right);
    results.push({ expected, ...measured });
  }
  return results;
}

export async function runSemanticGeneralization(engine) {
  const results = [];
  for (const [left, right] of SEMANTIC_GENERALIZATION_PAIRS) results.push(await engine.diagnoseWithEquivalence(left, right));
  return results;
}

const compactResult = ({ left, right, expected, group = "regression", pair = "", ...result }) => ({
  group, pair, left, right, expected,
  currentCanonicalRelation: result.relation,
  retrievalCosine: result.cosine,
  retrievalEligible: result.retrievalEligible,
  nliForward: result.nli.forward,
  nliReverse: result.nli.reverse,
  nliMutualEntailment: result.mutualEntailment,
  nliMutualMargin: result.mutualMargin,
  nliMaximumNeutral: result.maximumNeutral,
  nliMaximumContradiction: Math.max(result.nli.forward.contradiction, result.nli.reverse.contradiction),
  paraphraseScore: result.equivalence.score,
  propositionLabel: result.proposition.label,
  propositionScore: result.proposition.score,
  propositionRawLogit: result.proposition.rawLogit,
  propositionConfidence: result.proposition.score
});

export async function runCanonicalConsistency(engine) {
  const results = [];
  for (const [group, pair, left, right, expected] of CANONICAL_CONSISTENCY_PAIRS) {
    results.push(compactResult({ group, pair, left, right, expected, ...await engine.diagnoseWithEquivalence(left, right) }));
  }
  return results;
}

export async function runPropositionMatrix(engine) {
  const regression = (await runSemanticCalibration(engine)).map(compactResult);
  const generalization = (await runSemanticGeneralization(engine)).map(result => compactResult({ expected: "DIAGNOSTIC", group: "generalization", ...result }));
  return [...regression, ...generalization, ...await runCanonicalConsistency(engine)];
}

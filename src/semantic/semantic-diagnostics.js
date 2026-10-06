import { analyzeIdentityTriangle, evaluateShadowIdentity } from "./canonical-identity.js";

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

export const SEMANTIC_IDENTITY_HELD_OUT = Object.freeze([
  ["active-passive", "The gardener watered the roses", "The roses were watered by the gardener", "SAME"],
  ["active-passive", "Lena designed the poster", "The poster was designed by Lena", "SAME"],
  ["active-passive", "The mechanic repaired the bicycle", "The bicycle was repaired by the mechanic", "SAME"],
  ["active-passive", "Omar delivered the parcel", "The parcel was delivered by Omar", "SAME"],
  ["active-passive", "The jury selected the winner", "The winner was selected by the jury", "SAME"],
  ["role-reversal", "The nurse thanked the doctor", "The doctor thanked the nurse", "NOT_SAME"],
  ["role-reversal", "Priya invited Marco", "Marco invited Priya", "NOT_SAME"],
  ["role-reversal", "The fox followed the rabbit", "The rabbit followed the fox", "NOT_SAME"],
  ["role-reversal", "Nora lent a book to Liam", "Liam lent a book to Nora", "NOT_SAME"],
  ["role-reversal", "The editor questioned the author", "The author questioned the editor", "NOT_SAME"],
  ["paraphrase", "Please switch off the lamp", "Turn the lamp off", "SAME"],
  ["paraphrase", "The child is very tired", "The child is exhausted", "SAME"],
  ["paraphrase", "Ravi purchased a new coat", "Ravi bought a new coat", "SAME"],
  ["paraphrase", "The path ends beside the lake", "The trail finishes next to the lake", "SAME"],
  ["paraphrase", "Keep the door closed", "Do not leave the door open", "SAME"],
  ["related", "Mira started a bakery", "Mira enjoys baking bread", "NOT_SAME"],
  ["related", "The museum opens at nine", "The museum attracts tourists", "NOT_SAME"],
  ["related", "Kai studies astronomy", "Astronomy examines celestial objects", "NOT_SAME"],
  ["related", "Repair the roof", "Inspect the roof for damage", "NOT_SAME"],
  ["related", "The team won the semifinal", "The team will play in the final", "NOT_SAME"],
  ["negation", "The gate is locked", "The gate is not locked", "NOT_SAME"],
  ["negation", "Sofia remembers the address", "Sofia does not remember the address", "NOT_SAME"],
  ["negation", "The device supports wireless charging", "The device does not support wireless charging", "NOT_SAME"],
  ["negation", "We approved the proposal", "We rejected the proposal", "NOT_SAME"],
  ["negation", "The reservoir is full", "The reservoir is empty", "NOT_SAME"],
  ["value-change", "Order six notebooks", "Order eleven notebooks", "NOT_SAME"],
  ["value-change", "The workshop is on Wednesday", "The workshop is on Saturday", "NOT_SAME"],
  ["value-change", "Elin moved to Bergen", "Elin moved to Madrid", "NOT_SAME"],
  ["value-change", "Tariq emailed Zoe", "Tariq emailed Hana", "NOT_SAME"],
  ["value-change", "The train leaves at eight", "The train leaves at ten", "NOT_SAME"],
  ["asymmetric", "A sparrow is a bird", "A bird is a sparrow", "NOT_SAME"],
  ["asymmetric", "The vase shattered because it fell", "The vase fell", "NOT_SAME"],
  ["asymmetric", "Every cabin has a fireplace", "Some cabins have a fireplace", "NOT_SAME"],
  ["asymmetric", "No guests arrived early", "No guests arrived", "NOT_SAME"],
  ["asymmetric", "The red folder is on the desk", "A folder is on the desk", "NOT_SAME"],
  ["modality", "You could submit the form", "You must submit the form", "NOT_SAME"],
  ["modality", "I hope to visit Kyoto", "I will visit Kyoto", "NOT_SAME"],
  ["modality", "The package might arrive today", "The package will arrive today", "NOT_SAME"],
  ["modality", "Lea intends to lead the project", "Lea leads the project", "NOT_SAME"],
  ["modality", "Guests are advised to register", "Guests are required to register", "NOT_SAME"]
]);

export const CLEAN_SLATE_IDENTITY_10 = Object.freeze(["Learn how to trade", "Learn to trade", "I want to learn trading", "I want to learn how to trade", "I need to learn trading", "John sold the car to Mary", "The car was sold to Mary by John", "Mary sold the car to John", "I like trading", "I hate trading"]);
export const CLEAN_SLATE_TRADER_10 = Object.freeze(["Learn how to trade", "Learn to trade", "Learn how trading works", "Learn how to become a trader", "Learn to be a trader", "Become a trader", "Become a better trader", "I want to become a trader", "I am a trader", "I do not want to become a trader"]);

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

const compactResult = ({ left, right, expected, group = "regression", pair = "", ...result }) => {
  const shadow = evaluateShadowIdentity({ nli: result.nli, paraphrase: result.equivalence, stsb: result.proposition, currentCanonicalRelation: result.relation });
  return ({ group, pair, left, right, expected,
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
  propositionConfidence: result.proposition.score,
  shadow,
  canonicalAuthority: false
});
};

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

async function inspectSet(engine, pairs) {
  const rows = [];
  for (const [group, left, right, expected] of pairs) rows.push({ group, expected, ...await engine.inspectSemanticIdentity(left, right) });
  return rows;
}

async function simulateCleanSlate(engine, inputs) {
  const memories = []; const steps = [];
  for (const [index, input] of inputs.entries()) {
    const diagnostics = await engine.inspectCandidateIdentities(input, memories);
    const selected = diagnostics.shadowSelection;
    if (!selected) memories.push({ id: `shadow-${index + 1}`, content: input, embedding: await engine.encode(input) });
    steps.push({ index: index + 1, ...diagnostics, shadowAction: selected ? "REUSE" : "CREATE" });
  }
  return { steps, projectedMemories: memories.map(({ id, content }) => ({ id, content })), canonicalAuthority: false, persistence: "NONE" };
}

const scoreIdentity = rows => rows.reduce((summary, row) => {
  const actual = row.shadow.identity;
  if (["DIAGNOSTIC", "SAME_MEANING_OR_RELATED", "RELATED_OR_DISTINCT"].includes(row.expected)) { summary.skipped += 1; return summary; }
  const expectedSame = row.expected === "SAME" || row.expected === "SAME_MEANING";
  if (actual === "UNCERTAIN") summary.uncertain += 1;
  else if ((actual === "SAME") === expectedSame) summary.correct += 1;
  else summary.wrong += 1;
  return summary;
}, { correct: 0, uncertain: 0, wrong: 0, skipped: 0 });

export async function runCanonicalIdentityEvaluation(engine) {
  const existingMatrix = await runPropositionMatrix(engine);
  const heldOutMatrix = await inspectSet(engine, SEMANTIC_IDENTITY_HELD_OUT);
  const triangleRows = await inspectSet(engine, CANONICAL_CONSISTENCY_PAIRS.slice(0, 6).map(([group, , left, right, expected]) => [group, left, right, expected]));
  const triangleAnalysis = [0, 3].map(start => analyzeIdentityTriangle(triangleRows.slice(start, start + 3)));
  const cleanSlateIdentity10 = await simulateCleanSlate(engine, CLEAN_SLATE_IDENTITY_10);
  const cleanSlateTrader10 = await simulateCleanSlate(engine, CLEAN_SLATE_TRADER_10);
  return {
    existingMatrix, heldOutMatrix, triangleAnalysis, cleanSlateIdentity10, cleanSlateTrader10,
    summary: { existing: scoreIdentity(existingMatrix), heldOut: scoreIdentity(heldOutMatrix) },
    canonicalAuthority: false, productionMutation: false
  };
}

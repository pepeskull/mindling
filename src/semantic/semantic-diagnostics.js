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
  ["Sam gave Lee the key", "Lee gave Sam the key"]
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

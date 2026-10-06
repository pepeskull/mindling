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
  ["Learning programming is useful", "It is useful to learn programming", "SAME_MEANING"]
]);

export async function runSemanticCalibration(engine) {
  const results = [];
  for (const [left, right, expected] of SEMANTIC_CALIBRATION_PAIRS) {
    const measured = await engine.diagnosePair(left, right);
    results.push({ expected, ...measured });
  }
  return results;
}

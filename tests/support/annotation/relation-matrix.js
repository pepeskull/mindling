// Frozen comparison corpus for annotation fixture disjointness tests only.
const groupPairs = (name, sentences) => {
  const pairs = [];
  for (let left = 0; left < sentences.length; left += 1) for (let right = left + 1; right < sentences.length; right += 1) pairs.push({ group: name, expected: "SAME_TOPIC", left: sentences[left], right: sentences[right] });
  return pairs;
};
const crossPairs = (name, leftGroup, rightGroup) => leftGroup.flatMap(left => rightGroup.map(right => ({ group: name, expected: "DIFFERENT_TOPIC", left, right })));

const TRADING = Object.freeze(["Stock trading involves buying and selling shares", "Risk management is important when trading", "Traders study market prices"]);
const PROGRAMMING = Object.freeze(["JavaScript is used for web development", "Programming requires writing instructions for computers", "Developers use code to build software"]);
const SINGLETONS = Object.freeze(["Anna enjoys classical music", "The Earth orbits the Sun", "Dogs need regular exercise"]);
const GENERALIZATION = Object.freeze({
  cooking: ["Boiling pasta requires hot water", "Sauces can be prepared while pasta cooks", "Cooking time affects pasta texture"],
  photography: ["Aperture affects how much light reaches the sensor", "Shutter speed changes motion blur", "ISO affects sensor sensitivity"],
  astronomy: ["Mars has two small moons", "Telescopes help astronomers observe distant objects", "Planetary motion can be studied over time"],
  fitness: ["Strength training can increase muscular force", "Recovery helps muscles adapt after exercise", "Progressive overload changes training difficulty"],
  music: ["Chord progressions create harmonic movement", "Tempo determines the speed of a piece", "Musicians use rhythm to organize timing"]
});

export const KNOWLEDGE_BROWSER_CORPUS = Object.freeze([...TRADING, ...PROGRAMMING, ...SINGLETONS]);
const browserCorpus = KNOWLEDGE_BROWSER_CORPUS;
const browserPairs = [];
for (let left = 0; left < browserCorpus.length; left += 1) for (let right = left + 1; right < browserCorpus.length; right += 1) {
  const same = (left < 3 && right < 3) || (left >= 3 && left < 6 && right >= 3 && right < 6);
  browserPairs.push({ group: "browser-nine", expected: same ? "SAME_TOPIC" : "DIFFERENT_TOPIC", left: browserCorpus[left], right: browserCorpus[right] });
}
const generalizationWithin = Object.entries(GENERALIZATION).flatMap(([name, sentences]) => groupPairs(name, sentences));
const generalizationGroups = Object.values(GENERALIZATION);
const generalizationCross = [];
for (let left = 0; left < generalizationGroups.length; left += 1) for (let right = left + 1; right < generalizationGroups.length; right += 1) generalizationCross.push(...crossPairs("generalization-cross", [generalizationGroups[left][0]], [generalizationGroups[right][0]]));
const hardNegatives = [
  ["Traders study market prices", "Astronomers study distant stars"], ["Developers use code to build software", "Chefs use knives to prepare food"],
  ["Dogs need regular exercise", "Computers need regular maintenance"], ["Risk management is important when trading", "Sleep is important when recovering"],
  ["JavaScript is used for web development", "Steel is used for bridge construction"]
].map(([left, right]) => ({ group: "hard-negative", expected: "DIFFERENT_TOPIC", left, right }));
const structuralParaphrases = [
  ["Stock prices can fluctuate rapidly", "Market volatility creates risk for traders"], ["JavaScript runs in web browsers", "Frontend developers often write JavaScript"],
  ["A camera aperture controls incoming light", "More light reaches the sensor through a wider aperture"], ["Muscle recovery occurs after training", "Rest helps the body adapt to exercise"]
].map(([left, right]) => ({ group: "same-subject-different-structure", expected: "SAME_TOPIC", left, right }));

export const KNOWLEDGE_RELATION_MATRIX = Object.freeze([...browserPairs, ...generalizationWithin, ...generalizationCross, ...hardNegatives, ...structuralParaphrases]);

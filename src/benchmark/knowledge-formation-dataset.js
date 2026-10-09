const LANGUAGES = Object.freeze(["en", "sv", "es"]);
const FORMS = Object.freeze(["short", "long", "ambiguous", "paraphrase", "contradiction", "incomplete", "polysemy"]);
const SYLLABLES = Object.freeze(["al", "be", "cor", "di", "en", "far", "gan", "hel", "io", "jun", "kel", "lum", "mor", "nor", "or", "pra", "quin", "ris", "sol", "tor", "ul", "ver", "wen", "xe", "yor", "zen"]);

const unsigned = value => value >>> 0;
const mix = value => {
  let result = unsigned(value + 0x9e3779b9);
  result = Math.imul(result ^ result >>> 16, 0x21f0aaad);
  result = Math.imul(result ^ result >>> 15, 0x735a2d97);
  return unsigned(result ^ result >>> 15);
};
const hash = value => [...String(value)].reduce((state, character) => mix(state ^ character.codePointAt(0)), 2166136261);
const gcd = (left, right) => right ? gcd(right, left % right) : left;

const topicName = (seed, topicIndex) => {
  const value = mix(hash(seed) ^ topicIndex);
  return `${SYLLABLES[value % SYLLABLES.length]}${SYLLABLES[(value >>> 5) % SYLLABLES.length]}-${topicIndex.toString(36)}`;
};

const textFor = ({ language, form, topic, facet, polarity, sharedLexeme }) => {
  const detail = `${topic} facet ${facet}`;
  const templates = {
    en: {
      short: `${detail} is observed.`,
      long: `A learner recorded that ${detail} develops through repeated observation, comparison, and revision over time.`,
      ambiguous: `It changes when ${sharedLexeme} is present.`,
      paraphrase: `The observed subject concerns ${detail}.`,
      contradiction: `${detail} is ${polarity ? "supported" : "not supported"} by this experience.`,
      incomplete: `${detail} may depend on`,
      polysemy: `${sharedLexeme} has a distinct meaning in ${detail}.`
    },
    sv: {
      short: `${detail} observeras.`,
      long: `En elev noterade att ${detail} utvecklas genom upprepad observation, jämförelse och revidering över tid.`,
      ambiguous: `Det förändras när ${sharedLexeme} finns.`,
      paraphrase: `Det observerade ämnet handlar om ${detail}.`,
      contradiction: `${detail} är ${polarity ? "bekräftat" : "inte bekräftat"} av denna erfarenhet.`,
      incomplete: `${detail} kan bero på`,
      polysemy: `${sharedLexeme} har en annan betydelse inom ${detail}.`
    },
    es: {
      short: `Se observa ${detail}.`,
      long: `Un estudiante registró que ${detail} evoluciona mediante observación, comparación y revisión repetidas.`,
      ambiguous: `Cambia cuando aparece ${sharedLexeme}.`,
      paraphrase: `El tema observado trata de ${detail}.`,
      contradiction: `${detail} está ${polarity ? "respaldado" : "no respaldado"} por esta experiencia.`,
      incomplete: `${detail} puede depender de`,
      polysemy: `${sharedLexeme} tiene un significado distinto en ${detail}.`
    }
  };
  return templates[language][form];
};

export const BENCHMARK_SIZES = Object.freeze([1_000, 10_000, 100_000, 1_000_000]);
export const DEFAULT_DATASET_CONFIG = Object.freeze({ size: 100_000, seed: "mindling-knowledge-v1", topicCount: 5_000, orderSeed: 0 });

export function normalizeDatasetConfig(input = {}) {
  const size = Math.max(1, Math.min(1_000_000, Number(input.size) || DEFAULT_DATASET_CONFIG.size));
  const topicCount = Math.max(2, Math.min(size, Number(input.topicCount) || Math.min(DEFAULT_DATASET_CONFIG.topicCount, size)));
  return Object.freeze({ size, topicCount, seed: String(input.seed || DEFAULT_DATASET_CONFIG.seed), orderSeed: unsigned(Number(input.orderSeed) || 0) });
}

export function permuteCaseIndex(position, size, orderSeed = 0) {
  if (size <= 1 || !orderSeed) return position;
  let multiplier = (mix(orderSeed) % size) || 1;
  while (gcd(multiplier, size) !== 1) multiplier = (multiplier + 1) % size || 1;
  return (multiplier * position + mix(orderSeed ^ 0xa5a5a5a5)) % size;
}

export function generateKnowledgeCase(position, input = DEFAULT_DATASET_CONFIG) {
  const config = normalizeDatasetConfig(input);
  if (!Number.isInteger(position) || position < 0 || position >= config.size) throw new RangeError("Dataset position is outside the configured range");
  const index = permuteCaseIndex(position, config.size, config.orderSeed);
  const value = mix(hash(config.seed) ^ index); const topicIndex = index % config.topicCount;
  const language = LANGUAGES[value % LANGUAGES.length]; const form = FORMS[(value >>> 4) % FORMS.length];
  const topic = topicName(config.seed, topicIndex); const sharedLexeme = `term-${(topicIndex % 97).toString(36)}`;
  const caseId = `case-${hash(config.seed).toString(16)}-${index.toString(36)}`;
  const expectedPairs = [];
  if (index >= config.topicCount) expectedPairs.push(Object.freeze({ otherCaseId: `case-${hash(config.seed).toString(16)}-${(index - config.topicCount).toString(36)}`, expected: "SAME_AREA" }));
  if (index > 0) expectedPairs.push(Object.freeze({ otherCaseId: `case-${hash(config.seed).toString(16)}-${(index - 1).toString(36)}`, expected: topicIndex === (index - 1) % config.topicCount ? "SAME_AREA" : "DIFFERENT_AREA" }));
  return Object.freeze({
    caseId, sequence: position, sourceIndex: index,
    memory: Object.freeze({ id: `benchmark-memory-${caseId}`, content: textFor({ language, form, topic, facet: (value >>> 9) % 31,
      polarity: Boolean(value & 1), sharedLexeme }), language }),
    reference: Object.freeze({ topicKey: `synthetic-topic-${topicIndex}`, expectedPairs: Object.freeze(expectedPairs), independentlyVerified: false }),
    provenance: Object.freeze({ kind: "SYNTHETIC_STRUCTURE", generator: "mindling-deterministic-topic-stress-v1", seed: config.seed,
      humanVerified: false, aiLabeled: false, semanticAccuracyAuthority: false, form })
  });
}

export function createGeneratedDataset(input = {}) {
  const config = normalizeDatasetConfig(input);
  return Object.freeze({
    id: `generated-${hash(JSON.stringify(config)).toString(16)}`,
    metadata: Object.freeze({ ...config, kind: "SYNTHETIC_STRUCTURE", independentlyVerified: false,
      semanticAccuracyAuthority: false, languages: LANGUAGES, generator: "mindling-deterministic-topic-stress-v1" }),
    size: config.size,
    getCase: async position => generateKnowledgeCase(position, config)
  });
}

export function validateImportedCase(record, position = 0) {
  if (!record || typeof record !== "object") throw new TypeError(`Imported case ${position} is not an object`);
  const content = String(record.memory?.content ?? record.content ?? "").trim();
  if (!content) throw new TypeError(`Imported case ${position} has no memory content`);
  const provenance = record.provenance || {};
  return structuredClone({ caseId: String(record.caseId || `imported-${position}`), sequence: position,
    memory: { id: String(record.memory?.id || `benchmark-memory-imported-${position}`), content,
      ...(record.memory?.language || record.language ? { language: String(record.memory?.language || record.language) } : {}) },
    reference: { topicKey: record.reference?.topicKey ? String(record.reference.topicKey) : null,
      expectedPairs: Array.isArray(record.reference?.expectedPairs) ? record.reference.expectedPairs.map(pair => ({ otherCaseId: String(pair.otherCaseId), expected: String(pair.expected) })) : [],
      independentlyVerified: Boolean(record.reference?.independentlyVerified) },
    provenance: { kind: String(provenance.kind || "EXTERNAL_UNVERIFIED"), source: provenance.source ? String(provenance.source) : null,
      humanVerified: Boolean(provenance.humanVerified), aiLabeled: Boolean(provenance.aiLabeled),
      semanticAccuracyAuthority: Boolean(provenance.humanVerified && record.reference?.independentlyVerified) } });
}

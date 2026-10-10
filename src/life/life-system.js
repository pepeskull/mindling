export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const LIFE_RULES = Object.freeze({
  schemaVersion: 1,
  maximumOfflineStepHours: 48,
  criticalGraceHours: 96,
  decayPerHour: Object.freeze({ nutrition: .72, rest: .48, wellbeing: .34 }),
  activity: Object.freeze({
    TALK: Object.freeze({ label: "Talk to Mindling", energyCost: 1, wellbeingGain: 5 }),
    TEACH: Object.freeze({ label: "Teach Mindling", energyCost: 2, wellbeingGain: 10 }),
    DEEP_TRAINING: Object.freeze({ label: "Deep Training", energyCost: 3, wellbeingGain: 15 })
  }),
  care: Object.freeze({
    NOURISH: Object.freeze({ cooldownHours: 6, maximumBeforeCare: 85, nutritionGain: 28 }),
    REST: Object.freeze({ cooldownHours: 8, maximumBeforeCare: 80, restGain: 24 }),
    CARE: Object.freeze({ cooldownHours: 12, maximumBeforeCare: 90, healthGain: 14, wellbeingGain: 2 })
  }),
  social: Object.freeze({ playerEnergyCost: 0, minimumWellbeingGain: 2, maximumWellbeingGain: 5, dailyGainCap: 10 })
});

export const ENERGY_RULES = Object.freeze({ dailyAllowance: 10, resetStandard: "UTC_MIDNIGHT" });

const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const validTime = (value, fallback) => { const time = Date.parse(value); return Number.isFinite(time) ? time : fallback; };
export const utcDayKey = now => new Date(now).toISOString().slice(0, 10);
export const nextUtcReset = now => { const date = new Date(now); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1); };

export function neuralCycles(createdAt, now = Date.now(), deathAt = null) {
  const birth = validTime(createdAt, now); const end = deathAt ? validTime(deathAt, now) : now;
  return Math.max(1, Math.floor(Math.max(0, end - birth) / DAY_MS) + 1);
}

export function lifeStageFor(cycles) {
  if (cycles < 7) return "Neural Seed";
  if (cycles < 30) return "Developing Mind";
  return "Learning Mind";
}

export function conditionFor(attributes, deceased = false) {
  if (deceased) return "DECEASED";
  const values = Object.values(attributes); const criticallyLow = values.filter(value => value <= 10).length;
  if (attributes.wellbeing <= 14 || attributes.health <= 15 || criticallyLow >= 2) return "CRITICAL";
  if (attributes.health <= 35 || attributes.wellbeing < 40 || values.some(value => value <= 25)) return "WEAKENED";
  if (attributes.wellbeing < 70 || attributes.nutrition < 50 || attributes.rest < 45 || attributes.health < 70) return "NEEDS ATTENTION";
  return "STABLE";
}

export function createLifeState({ createdAt, now = Date.now() }) {
  const birth = new Date(validTime(createdAt, now)).toISOString();
  return Object.freeze({ id: "primary", schemaVersion: LIFE_RULES.schemaVersion, birthTimestamp: birth,
    attributes: Object.freeze({ health: 100, nutrition: 100, rest: 100, wellbeing: 100 }),
    lifeState: "ALIVE", condition: "STABLE", lastSimulationAt: new Date(now).toISOString(), lastPlayerAttentionAt: new Date(now).toISOString(),
    criticalSince: null, deathTimestamp: null, ageAtDeath: null,
    energy: Object.freeze({ remaining: ENERGY_RULES.dailyAllowance, maximum: ENERGY_RULES.dailyAllowance,
      utcDay: utcDayKey(now), nextResetAt: new Date(nextUtcReset(now)).toISOString() }),
    careCooldowns: Object.freeze({ NOURISH: null, REST: null, CARE: null }), history: Object.freeze([]) });
}

const refreshEnergy = (energy, now) => energy?.utcDay === utcDayKey(now)
  ? { ...energy, maximum: ENERGY_RULES.dailyAllowance, nextResetAt: new Date(nextUtcReset(now)).toISOString() }
  : { remaining: ENERGY_RULES.dailyAllowance, maximum: ENERGY_RULES.dailyAllowance, utcDay: utcDayKey(now), nextResetAt: new Date(nextUtcReset(now)).toISOString() };

const appendHistory = (history, item) => [...(history || []), item].slice(-200);

export function advanceLife(input, now = Date.now()) {
  if (!input) throw new TypeError("Life state is required");
  const state = structuredClone(input); const parsedLast = validTime(state.lastSimulationAt, now);
  const last = parsedLast > now + 300_000 ? now : parsedLast;
  const elapsed = Math.max(0, Math.min(now - last, LIFE_RULES.maximumOfflineStepHours * HOUR_MS));
  state.energy = refreshEnergy(state.energy, now);
  if (state.lifeState === "DECEASED") return Object.freeze({ ...state, energy: Object.freeze(state.energy) });
  const hours = elapsed / HOUR_MS; const attributes = { ...state.attributes };
  attributes.nutrition = clamp(attributes.nutrition - hours * LIFE_RULES.decayPerHour.nutrition);
  attributes.rest = clamp(attributes.rest - hours * LIFE_RULES.decayPerHour.rest);
  attributes.wellbeing = clamp(attributes.wellbeing - hours * LIFE_RULES.decayPerHour.wellbeing);
  const physicalRisk = Math.max(0, 20 - attributes.nutrition) / 20 + Math.max(0, 15 - attributes.rest) / 15;
  const abandonmentRisk = Math.max(0, 15 - attributes.wellbeing) / 15;
  attributes.health = clamp(attributes.health - hours * .28 * physicalRisk * (1 + abandonmentRisk));
  state.attributes = attributes; state.lastSimulationAt = new Date(last + elapsed).toISOString();
  state.condition = conditionFor(attributes);
  if (state.condition === "CRITICAL") state.criticalSince ||= new Date(last + elapsed).toISOString();
  else state.criticalSince = null;
  const criticalHours = state.criticalSince ? Math.max(0, (last + elapsed - validTime(state.criticalSince, last + elapsed)) / HOUR_MS) : 0;
  const sustainedFailure = attributes.health <= 5 && [attributes.nutrition, attributes.rest, attributes.wellbeing].filter(value => value <= 5).length >= 2;
  if (sustainedFailure && criticalHours >= LIFE_RULES.criticalGraceHours) {
    state.lifeState = "DECEASED"; state.condition = "DECEASED"; state.deathTimestamp = new Date(last + elapsed).toISOString();
    state.ageAtDeath = neuralCycles(state.birthTimestamp, last + elapsed, state.deathTimestamp);
    state.history = appendHistory(state.history, { type: "DEATH", at: state.deathTimestamp, reason: "SUSTAINED_SEVERE_NEGLECT" });
  }
  return Object.freeze({ ...state, attributes: Object.freeze(attributes), energy: Object.freeze(state.energy),
    careCooldowns: Object.freeze({ ...state.careCooldowns }), history: Object.freeze([...(state.history || [])]) });
}

export function applyActivity(input, activity, { now = Date.now(), activityId } = {}) {
  const state = structuredClone(advanceLife(input, now)); const rule = LIFE_RULES.activity[activity];
  if (!rule) return { accepted: false, reason: "UNKNOWN_ACTIVITY", state: input };
  if (state.lifeState === "DECEASED") return { accepted: false, reason: "MINDLING_DECEASED", state: input };
  if (state.energy.remaining < rule.energyCost) return { accepted: false, reason: "OUT_OF_ENERGY", state };
  state.energy.remaining -= rule.energyCost; state.attributes.wellbeing = clamp(state.attributes.wellbeing + rule.wellbeingGain);
  state.lastPlayerAttentionAt = new Date(now).toISOString(); state.condition = conditionFor(state.attributes); if (state.condition !== "CRITICAL") state.criticalSince = null;
  const journal = Object.freeze({ id: String(activityId || crypto.randomUUID()), type: activity, label: rule.label, at: new Date(now).toISOString(),
    energyCost: rule.energyCost, wellbeingGain: rule.wellbeingGain, balanceAfter: state.energy.remaining });
  state.history = appendHistory(state.history, { type: "PLAYER_ACTIVITY", ...journal });
  return { accepted: true, state: Object.freeze(state), journal };
}

export function applyCare(input, careType, { now = Date.now() } = {}) {
  const state = structuredClone(advanceLife(input, now)); const rule = LIFE_RULES.care[careType];
  if (!rule) return { accepted: false, reason: "UNKNOWN_CARE", state: input };
  if (state.lifeState === "DECEASED") return { accepted: false, reason: "MINDLING_DECEASED", state: input };
  const previous = state.careCooldowns?.[careType]; const availableAt = previous ? validTime(previous, 0) + rule.cooldownHours * HOUR_MS : 0;
  if (now < availableAt) return { accepted: false, reason: "CARE_COOLDOWN", availableAt: new Date(availableAt).toISOString(), state };
  const primary = careType === "NOURISH" ? state.attributes.nutrition : careType === "REST" ? state.attributes.rest : state.attributes.health;
  if (primary > rule.maximumBeforeCare) return { accepted: false, reason: careType === "NOURISH" ? "NOT_HUNGRY" : careType === "REST" ? "ALREADY_RESTED" : "CARE_NOT_NEEDED", state };
  state.attributes.nutrition = clamp(state.attributes.nutrition + (rule.nutritionGain || 0));
  state.attributes.rest = clamp(state.attributes.rest + (rule.restGain || 0));
  state.attributes.health = clamp(state.attributes.health + (rule.healthGain || 0));
  state.attributes.wellbeing = clamp(state.attributes.wellbeing + (rule.wellbeingGain || 0));
  state.careCooldowns = { ...state.careCooldowns, [careType]: new Date(now).toISOString() };
  state.condition = conditionFor(state.attributes); if (state.condition !== "CRITICAL") state.criticalSince = null;
  state.history = appendHistory(state.history, { type: "BASIC_CARE", careType, at: new Date(now).toISOString() });
  return { accepted: true, state: Object.freeze(state), energyCost: 0 };
}

export function warningFor(state) {
  if (state.lifeState === "DECEASED") return { status: "DECEASED", message: "Your Mindling's life cycle has ended." };
  if (state.condition === "CRITICAL") return { status: "CRITICAL", message: "Your Mindling is in critical condition. Immediate care is required." };
  if (state.condition === "WEAKENED") return { status: "WEAKENED", message: "Your Mindling is becoming weaker. Give it attention and care." };
  if (state.attributes.nutrition < 50) return { status: "LOW NUTRITION", message: "Your Mindling needs nourishment." };
  if (state.attributes.rest < 45) return { status: "NEEDS REST", message: "Your Mindling needs time to recover." };
  if (state.attributes.wellbeing < 70) return { status: "UNDERSTIMULATED", message: "Your Mindling has been without meaningful interaction for too long." };
  return { status: "STABLE", message: "Your Mindling's life signs are stable." };
}

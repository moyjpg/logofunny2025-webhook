const assert = require("assert");
const {
  normalizeConfirmedDirection,
  hashConfirmedDirection,
} = require("../services/confirmedDirectionContract");
const {
  buildDeterministicInternalBrief,
  normalizeStrategistBrief,
} = require("../services/internalBrandBriefService");
const fixtures = require("./fixtures/onboardingConfirmedDirections");

function assertBriefShape(brief) {
  assert.equal(brief.contract_version, "internal_brand_brief.v1");
  assert.match(brief.source_confirmed_direction_hash, /^[a-f0-9]{64}$/);
  assert(brief.brand_name);
  assert(brief.business_context);
  assert(Array.isArray(brief.desired_feelings));
  assert(Array.isArray(brief.hard_constraints));
  assert(Array.isArray(brief.unknowns));
  assert(brief.confidence.overall >= 0 && brief.confidence.overall <= 1);
  assert(Object.values(brief.coverage).every(Boolean));
}

const normalized = {};
for (const [name, fixture] of Object.entries(fixtures)) {
  normalized[name] = normalizeConfirmedDirection(fixture);
  assert(normalized[name], `${name} confirmed_direction should validate`);
  const brief = buildDeterministicInternalBrief(normalized[name]);
  assertBriefShape(brief);
  assert.equal(brief.brand_name, fixture.facts.brand_name);
  assert.equal(brief.business_context, fixture.facts.business_context);
  assert.deepEqual(brief.hard_constraints, fixture.constraints.hard);
  assert.deepEqual(brief.things_to_avoid, fixture.constraints.things_to_avoid);
}

const phorkBrief = buildDeterministicInternalBrief(normalized.phork);
assert(phorkBrief.hard_constraints.includes("No mascots."));
assert(phorkBrief.undesired_feelings.includes("childish"));
assert(phorkBrief.desired_feelings.includes("playful"));

const lumaBrief = buildDeterministicInternalBrief(normalized.luma);
assert.equal(lumaBrief.audience, null);
assert.equal(lumaBrief.differentiator, null);
assert(lumaBrief.unknowns.includes("audience"));
assert(lumaBrief.unknowns.includes("differentiator"));
const lumaStrategist = normalizeStrategistBrief({
  audience: "creators",
  desired_feelings: [],
  undesired_feelings: [],
  soft_preferences: [],
  differentiator: null,
}, normalized.luma);
assert(lumaStrategist);
assert.equal(lumaStrategist.audience, "creators");
assert(lumaStrategist.coverage.unknowns_not_promoted_to_facts);

const northlineBrief = buildDeterministicInternalBrief(normalized.northline);
assert(!northlineBrief.desired_feelings.includes("premium and luxurious"));
assert(northlineBrief.undesired_feelings.includes("luxury"));
assert(northlineBrief.soft_preferences.includes(normalized.northline.facts.main_direction));
assert(northlineBrief.coverage.user_corrections_preserved);
const northlineStrategist = normalizeStrategistBrief({
  audience: normalized.northline.facts.audience,
  desired_feelings: ["premium and luxurious"],
  undesired_feelings: ["luxury"],
  soft_preferences: ["premium and luxurious"],
  differentiator: null,
}, normalized.northline);
assert(northlineStrategist);
assert(!northlineStrategist.desired_feelings.includes("premium and luxurious"));
assert(!northlineStrategist.soft_preferences.includes("premium and luxurious"));

const mossBase = buildDeterministicInternalBrief(normalized.mossAndTail);
const mossStrategist = normalizeStrategistBrief({
  audience: "Affluent urban millennials",
  desired_feelings: ["warm", "luxurious"],
  undesired_feelings: ["plastic-looking"],
  soft_preferences: ["moss green and warm cream", "high-fashion editorial"],
  differentiator: "made from recycled climbing rope",
}, normalized.mossAndTail);
assert(mossStrategist);
assert.equal(mossStrategist.audience, mossBase.audience);
assert.equal(mossStrategist.differentiator, "made from recycled climbing rope");
assert(!mossStrategist.desired_feelings.includes("luxurious"));
assert(!mossStrategist.soft_preferences.includes("high-fashion editorial"));
assert(mossStrategist.soft_preferences.includes("moss green and warm cream"));

const crowdedPhork = JSON.parse(JSON.stringify(normalized.phork));
crowdedPhork.constraints.soft = Array.from({ length: 30 }, (_, index) => `Soft preference ${index + 1}`);
crowdedPhork.provenance.user_summary_edits.push({
  field: "mainDirection",
  previous_value: "An older direction.",
  previous_source: "ai_inferred",
  new_value: crowdedPhork.facts.main_direction,
  edited_at: "2026-08-20T07:59:00.000Z",
  invalidated_inference_ids: [],
});
const crowdedBrief = buildDeterministicInternalBrief(crowdedPhork);
assert(crowdedBrief.soft_preferences.includes(crowdedPhork.facts.main_direction));
assert(crowdedBrief.coverage.user_corrections_preserved);

assert.equal(
  hashConfirmedDirection(normalized.phork),
  hashConfirmedDirection(JSON.parse(JSON.stringify(normalized.phork)))
);

console.log("four onboarding fixtures and Internal Brand Brief coverage checks passed");

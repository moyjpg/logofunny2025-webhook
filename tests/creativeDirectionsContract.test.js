const assert = require("assert");
const {
  buildDeterministicInternalBrief,
} = require("../services/internalBrandBriefService");
const {
  normalizeInternalBrandBrief,
  hashInternalBrandBrief,
  directionsAreDistinct,
  normalizeCreativeDirections,
} = require("../services/creativeDirectionsService");
const { normalizeConfirmedDirection } = require("../services/confirmedDirectionContract");
const confirmedFixtures = require("./fixtures/onboardingConfirmedDirections");

const ROUTES = [
  {
    name: "Signature Gesture",
    core_idea: "Build recognition around one ownable visual gesture derived from the strongest confirmed brand signal.",
    brand_signal: "Immediate character with controlled clarity.",
    symbol_strategy: "Use one reduced symbol whose silhouette stays recognizable before any interior detail is read.",
    typography_strategy: "Pair the symbol with a wordmark whose rhythm echoes the symbol without copying its shape.",
    color_strategy: "Use one dominant brand color with a restrained neutral support role; color reinforces hierarchy rather than decoration.",
    composition_strategy: "Favor a compact primary lockup and preserve a clear standalone-symbol crop for small placements.",
    distinctive_move: "Repeat one controlled gesture across symbol and letter spacing.",
  },
  {
    name: "Typographic Character",
    core_idea: "Let the brand name carry the identity through a carefully controlled, memorable typographic intervention.",
    brand_signal: "Confident, direct, and name-led.",
    symbol_strategy: "Treat any secondary mark as an extraction from the wordmark rather than an unrelated icon.",
    typography_strategy: "Customize one or two letter relationships while keeping the full name readable at practical sizes.",
    color_strategy: "Lead in monochrome, then add a single accent color only where it strengthens the custom letter detail.",
    composition_strategy: "Use a horizontal wordmark as the anchor and a compact letter-derived alternate for constrained spaces.",
    distinctive_move: "Turn one letter connection into the recurring identity device.",
  },
  {
    name: "Framed Contrast",
    core_idea: "Express the brief through deliberate contrast between an orderly outer structure and a more expressive inner element.",
    brand_signal: "Balance, tension, and recognizable structure.",
    symbol_strategy: "Contain a simple expressive form inside a stable frame, with both parts legible in one color.",
    typography_strategy: "Use a restrained wordmark so the contrast inside the mark remains the focal point.",
    color_strategy: "Assign distinct functional roles to base and accent colors while retaining a complete one-color version.",
    composition_strategy: "Use generous breathing room around the framed mark and avoid decorative elements outside the core silhouette.",
    distinctive_move: "Create an intentional break in the frame that points toward the inner form.",
  },
  {
    name: "Rhythmic System",
    core_idea: "Create identity from a small set of repeated forms whose rhythm can scale from logo to supporting brand pattern.",
    brand_signal: "Momentum, cohesion, and flexible expression.",
    symbol_strategy: "Assemble two or three simple units into a distinct silhouette instead of relying on a literal category icon.",
    typography_strategy: "Match type spacing and weight to the cadence of the repeated units while preserving easy reading.",
    color_strategy: "Use controlled color alternation to clarify rhythm, with a restrained fallback when multiple colors are unavailable.",
    composition_strategy: "Support both a compact cluster and an expanded sequence without changing the underlying form language.",
    distinctive_move: "Vary one unit in the sequence to create an ownable focal beat.",
  },
];

function mockedModelOutput(brief) {
  const requiredAvoid = Array.from(new Set([...brief.undesired_feelings, ...brief.things_to_avoid]));
  return {
    contract_version: "creative_directions.v1",
    source_internal_brand_brief_hash: hashInternalBrandBrief(brief),
    brand_name: brief.brand_name,
    directions: ROUTES.map((route, index) => ({
      id: `direction_${index + 1}`,
      ...route,
      constraints_applied: brief.hard_constraints,
      avoid: requiredAvoid,
      confidence: 0.82 - index * 0.03,
    })),
    coverage: {
      source_brief_verified: false,
      hard_constraints_applied_to_every_direction: false,
      negative_intent_applied_to_every_direction: false,
      directions_are_distinct: false,
    },
  };
}

for (const [name, fixture] of Object.entries(confirmedFixtures)) {
  const confirmed = normalizeConfirmedDirection(fixture);
  assert(confirmed, `${name}: confirmed direction should validate`);
  const rawBrief = buildDeterministicInternalBrief(confirmed);
  const brief = normalizeInternalBrandBrief(rawBrief);
  assert(brief, `${name}: internal brief should validate for Layer 4`);

  const result = normalizeCreativeDirections(mockedModelOutput(brief), brief);
  assert(result, `${name}: creative directions should validate`);
  assert.equal(result.contract_version, "creative_directions.v1");
  assert.equal(result.brand_name, brief.brand_name);
  assert.equal(result.source_internal_brand_brief_hash, hashInternalBrandBrief(brief));
  assert.equal(result.directions.length, 4);
  assert.equal(new Set(result.directions.map((direction) => direction.id)).size, 4);
  assert.equal(new Set(result.directions.map((direction) => direction.name)).size, 4);
  assert(Object.values(result.coverage).every(Boolean));

  const requiredAvoid = Array.from(new Set([...brief.undesired_feelings, ...brief.things_to_avoid]));
  for (const direction of result.directions) {
    assert.deepEqual(direction.constraints_applied, brief.hard_constraints);
    assert.deepEqual(direction.avoid, requiredAvoid);
    assert.equal(Object.prototype.hasOwnProperty.call(direction, "prompt"), false);
  }
}

const phork = normalizeConfirmedDirection(confirmedFixtures.phork);
const phorkBrief = normalizeInternalBrandBrief(buildDeterministicInternalBrief(phork));
assert(phorkBrief);
const duplicate = mockedModelOutput(phorkBrief);
duplicate.directions[1] = { ...duplicate.directions[0], id: "direction_2" };
assert.equal(normalizeCreativeDirections(duplicate, phorkBrief), null);

const chineseRoutes = [
  { name: "清晰路径", core_idea: "用一条有节奏的路径表达从混乱到清楚。", symbol_strategy: "简化为可缩放的折线。", distinctive_move: "在转折处留出呼吸空间。" },
  { name: "开放网格", core_idea: "以开放结构表达团队协作与灵活安排。", symbol_strategy: "使用不封闭的模块网格。", distinctive_move: "让一个模块轻微错位。" },
  { name: "连续线程", core_idea: "用连续线条连接任务、成员与进度。", symbol_strategy: "形成单线连续图形。", distinctive_move: "在线条连接处形成独特节点。" },
  { name: "安静窗口", core_idea: "用留白和窗口感表现专注与平静。", symbol_strategy: "建立带缺口的简洁框架。", distinctive_move: "让缺口成为方向提示。" },
];
assert.equal(directionsAreDistinct(chineseRoutes), true);

const promptLeak = mockedModelOutput(phorkBrief);
promptLeak.directions[0].prompt = "This field belongs to Layer 5 and must be rejected.";
assert.equal(normalizeCreativeDirections(promptLeak, phorkBrief), null);

const droppedConstraint = mockedModelOutput(phorkBrief);
droppedConstraint.directions[0].constraints_applied = [];
const repairedConstraint = normalizeCreativeDirections(droppedConstraint, phorkBrief);
assert(repairedConstraint);
assert.deepEqual(repairedConstraint.directions[0].constraints_applied, phorkBrief.hard_constraints);

const droppedNegativeIntent = mockedModelOutput(phorkBrief);
droppedNegativeIntent.directions[0].avoid = [];
const repairedNegativeIntent = normalizeCreativeDirections(droppedNegativeIntent, phorkBrief);
assert(repairedNegativeIntent);
assert.deepEqual(
  repairedNegativeIntent.directions[0].avoid,
  Array.from(new Set([...phorkBrief.undesired_feelings, ...phorkBrief.things_to_avoid]))
);

const unverifiedBrief = buildDeterministicInternalBrief(phork);
unverifiedBrief.coverage.hard_constraints_preserved = false;
assert.equal(normalizeInternalBrandBrief(unverifiedBrief), null);

assert.equal(
  hashInternalBrandBrief(phorkBrief),
  hashInternalBrandBrief(JSON.parse(JSON.stringify(phorkBrief)))
);

console.log("four onboarding fixtures and Creative Directions contract checks passed");

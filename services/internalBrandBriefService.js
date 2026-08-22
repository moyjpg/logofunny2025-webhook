// Layer 3 only: confirmed_direction.v1 -> internal_brand_brief.v1.
// The deterministic pass owns user-fact preservation and coverage. The
// optional Strategist may classify additional grounded context, never replace
// confirmed facts or introduce hard constraints.

const fetch = require("node-fetch");
const internalBrandBriefSchema = require("../contracts/internal-brand-brief.v1.schema.json");
const { hashConfirmedDirection } = require("./confirmedDirectionContract");

const CONTRACT_VERSION = "internal_brand_brief.v1";
const DEFAULT_TIMEOUT_MS = 30_000;
const outputSchema = { ...internalBrandBriefSchema };
delete outputSchema.$schema;
delete outputSchema.$id;

function getStrategistConfig() {
  const timeoutRaw = Number.parseInt(process.env.ONBOARDING_STRATEGIST_FETCH_TIMEOUT_MS || "", 10);
  return {
    enabled: String(process.env.ONBOARDING_BRIEF_ENABLED || "").toLowerCase() === "true",
    apiKey: process.env.ONBOARDING_STRATEGIST_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.ONBOARDING_STRATEGIST_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    // The strategist runs once after user confirmation, so it can use the
    // stronger balanced tier without making every chat turn expensive.
    model: process.env.ONBOARDING_STRATEGIST_MODEL || "gpt-5.6-terra",
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
  };
}

function uniqueStrings(items, maxItems = 30) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const value = typeof raw === "string" ? raw.trim() : "";
    const key = value.toLowerCase().replace(/\s+/g, " ");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function advancedChoicePreferences(choices) {
  const ignored = new Set(["", "auto", "let_logofunny_decide"]);
  const pairs = [
    ["Visual style", choices.visual_style],
    ["Color preference", choices.color_preference],
    ["Existing visual idea preference", choices.existing_visual_idea_preference],
    ["Logo structure", choices.logo_structure],
    ["Icon direction", choices.icon_direction],
    ["Detail level", choices.detail_level],
    ["Typography", choices.typography],
  ];
  const out = pairs
    .filter(([, value]) => !ignored.has(String(value || "").toLowerCase()))
    .map(([label, value]) => `${label}: ${value}`);
  if (choices.color_description) out.push(`Color: ${choices.color_description}`);
  return out;
}

function buildUnknowns(brief) {
  const unknowns = [];
  if (!brief.audience) unknowns.push("audience");
  if (brief.desired_feelings.length === 0) unknowns.push("desired feelings");
  if (brief.existing_visual_ideas.length === 0) unknowns.push("existing visual ideas");
  if (!brief.differentiator) unknowns.push("differentiator");
  return unknowns;
}

function buildConfidence(brief, source = "deterministic") {
  const byField = [
    { field: "brand_name", confidence: 1 },
    { field: "business_context", confidence: 1 },
    { field: "audience", confidence: brief.audience ? (source === "ai" ? 0.78 : 0.95) : 0 },
    { field: "desired_feelings", confidence: brief.desired_feelings.length ? 0.95 : 0 },
    { field: "hard_constraints", confidence: 1 },
    { field: "differentiator", confidence: brief.differentiator ? (source === "ai" ? 0.72 : 0.95) : 0 },
  ];
  const known = byField.filter((item) => item.confidence > 0);
  const overall = known.length
    ? Number((known.reduce((sum, item) => sum + item.confidence, 0) / known.length).toFixed(3))
    : 0;
  return { overall, by_field: byField };
}

function allIncluded(required, actual) {
  const actualSet = new Set(actual);
  return required.every((item) => actualSet.has(item));
}

function briefStrings(brief) {
  return [
    brief.business_context,
    brief.brand_name,
    brief.audience,
    ...brief.desired_feelings,
    ...brief.undesired_feelings,
    ...brief.hard_constraints,
    ...brief.soft_preferences,
    ...brief.existing_visual_ideas,
    brief.differentiator,
    ...brief.things_to_avoid,
  ].filter(Boolean);
}

function latestEditsByField(confirmed) {
  const latest = new Map();
  for (const edit of confirmed.provenance.user_summary_edits) latest.set(edit.field, edit);
  return latest;
}

function userCorrectionsPreserved(confirmed, brief) {
  const latest = latestEditsByField(confirmed);
  const checks = [];
  for (const [field] of latest) {
    if (field === "brand") checks.push(brief.brand_name === confirmed.facts.brand_name);
    else if (field === "whatYoureBuilding") checks.push(brief.business_context === confirmed.facts.business_context);
    else if (field === "whoItsFor") checks.push(brief.audience === confirmed.facts.audience);
    else if (field === "howItShouldFeel") checks.push(allIncluded(confirmed.facts.desired_feelings, brief.desired_feelings));
    else if (field === "whatToAvoid") checks.push(allIncluded(confirmed.constraints.things_to_avoid, brief.things_to_avoid));
    else if (field === "mainDirection" && confirmed.facts.main_direction) {
      checks.push(brief.soft_preferences.includes(confirmed.facts.main_direction));
    }
  }

  const currentApproved = new Set([
    confirmed.facts.brand_name,
    confirmed.facts.business_context,
    confirmed.facts.audience,
    ...confirmed.facts.desired_feelings,
    ...confirmed.facts.undesired_feelings,
    ...confirmed.constraints.hard,
    ...confirmed.constraints.soft,
    ...confirmed.constraints.things_to_avoid,
    confirmed.facts.main_direction,
  ].filter(Boolean));
  const activeBriefStrings = new Set(briefStrings(brief));
  const staleResurfaced = confirmed.provenance.ai_inferences.some(
    (item) => item.status === "invalidated" && !currentApproved.has(item.value) && activeBriefStrings.has(item.value)
  );
  return checks.every(Boolean) && !staleResurfaced;
}

function computeCoverage(confirmed, brief) {
  return {
    hard_constraints_preserved: allIncluded(confirmed.constraints.hard, brief.hard_constraints),
    negative_intent_preserved:
      allIncluded(confirmed.facts.undesired_feelings, brief.undesired_feelings) &&
      allIncluded(confirmed.constraints.things_to_avoid, brief.things_to_avoid),
    user_corrections_preserved: userCorrectionsPreserved(confirmed, brief),
    unknowns_not_promoted_to_facts:
      (Boolean(confirmed.facts.audience) || brief.audience === null || isGroundedInConfirmed(brief.audience, confirmed)) &&
      (!brief.differentiator || isGroundedInConfirmed(brief.differentiator, confirmed)),
  };
}

function buildDeterministicInternalBrief(confirmed) {
  const softPreferences = uniqueStrings([
    confirmed.facts.main_direction,
    ...advancedChoicePreferences(confirmed.advanced_choices),
    ...confirmed.constraints.soft,
    confirmed.facts.visual_style_leaning
      ? `Visual style leaning: ${confirmed.facts.visual_style_leaning}`
      : "",
  ]);
  const brief = {
    contract_version: CONTRACT_VERSION,
    source_confirmed_direction_hash: hashConfirmedDirection(confirmed),
    business_context: confirmed.facts.business_context,
    brand_name: confirmed.facts.brand_name,
    audience: confirmed.facts.audience,
    desired_feelings: uniqueStrings(confirmed.facts.desired_feelings, 20),
    undesired_feelings: uniqueStrings(confirmed.facts.undesired_feelings, 20),
    hard_constraints: uniqueStrings(confirmed.constraints.hard),
    soft_preferences: softPreferences,
    existing_visual_ideas: uniqueStrings(confirmed.facts.existing_visual_ideas, 20),
    differentiator: null,
    things_to_avoid: uniqueStrings(confirmed.constraints.things_to_avoid),
    unknowns: [],
    confidence: { overall: 0, by_field: [] },
    coverage: {
      hard_constraints_preserved: false,
      negative_intent_preserved: false,
      user_corrections_preserved: false,
      unknowns_not_promoted_to_facts: false,
    },
  };
  brief.unknowns = buildUnknowns(brief);
  brief.confidence = buildConfidence(brief);
  brief.coverage = computeCoverage(confirmed, brief);
  return brief;
}

function normalizedText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function confirmedCorpus(confirmed) {
  return normalizedText([
    confirmed.facts.brand_name,
    confirmed.facts.business_context,
    confirmed.facts.audience,
    ...confirmed.facts.desired_feelings,
    ...confirmed.facts.undesired_feelings,
    ...confirmed.facts.existing_visual_ideas,
    confirmed.facts.visual_style_leaning,
    confirmed.facts.main_direction,
    ...Object.values(confirmed.advanced_choices),
    confirmed.provenance.voluntary_extra_context,
    ...confirmed.provenance.adaptive_answers.map((item) => item.answer),
    ...confirmed.provenance.user_summary_edits.map((item) => item.new_value),
  ].filter(Boolean).join("\n"));
}

function isGroundedInConfirmed(value, confirmed) {
  const needle = normalizedText(value);
  return Boolean(needle) && confirmedCorpus(confirmed).includes(needle);
}

function groundedExtras(values, confirmed, maxItems, maxLength) {
  if (!Array.isArray(values)) return [];
  return uniqueStrings(values
    .filter((value) => typeof value === "string")
    .map((value) => value.trim().slice(0, maxLength))
    .filter((value) => isGroundedInConfirmed(value, confirmed)), maxItems);
}

function normalizeStrategistBrief(parsed, confirmed) {
  if (!parsed || typeof parsed !== "object") return null;
  const base = buildDeterministicInternalBrief(confirmed);
  const invalidatedValues = new Set(
    confirmed.provenance.ai_inferences
      .filter((item) => item.status === "invalidated")
      .map((item) => item.value)
  );
  const approvedValues = new Set(briefStrings(base));
  const invalidatedNormalized = Array.from(invalidatedValues).map(normalizedText).filter(Boolean);
  const allowExtra = (value) => {
    if (approvedValues.has(value)) return true;
    const candidate = normalizedText(value);
    return !invalidatedNormalized.some(
      (stale) => candidate === stale || candidate.includes(stale)
    );
  };

  const audienceCandidate = typeof parsed.audience === "string" ? parsed.audience.trim().slice(0, 1_000) : null;
  const differentiatorCandidate = typeof parsed.differentiator === "string"
    ? parsed.differentiator.trim().slice(0, 1_200)
    : null;
  const brief = {
    ...base,
    audience: base.audience || (
      audienceCandidate && allowExtra(audienceCandidate) && isGroundedInConfirmed(audienceCandidate, confirmed)
        ? audienceCandidate
        : null
    ),
    desired_feelings: uniqueStrings([
      ...base.desired_feelings,
      ...groundedExtras(parsed.desired_feelings, confirmed, 20, 500).filter(allowExtra),
    ], 20),
    undesired_feelings: uniqueStrings([
      ...base.undesired_feelings,
      ...groundedExtras(parsed.undesired_feelings, confirmed, 20, 1_200).filter(allowExtra),
    ], 20),
    soft_preferences: uniqueStrings([
      ...base.soft_preferences,
      ...groundedExtras(parsed.soft_preferences, confirmed, 30, 1_200).filter(allowExtra),
    ]),
    differentiator:
      differentiatorCandidate && allowExtra(differentiatorCandidate) && isGroundedInConfirmed(differentiatorCandidate, confirmed)
        ? differentiatorCandidate
        : null,
  };
  brief.unknowns = buildUnknowns(brief);
  brief.confidence = buildConfidence(brief, "ai");
  brief.coverage = computeCoverage(confirmed, brief);
  return Object.values(brief.coverage).every(Boolean) ? brief : null;
}

function buildStrategistInstructions() {
  return `You are LogoFunny's internal Brand Strategist. Convert a user-confirmed direction into the supplied Internal Brand Brief schema.

This is Layer 3 only. Do not create Creative Directions, symbol strategy, typography strategy, color strategy, prompts, or logos.

Rules:
- confirmed_direction is the highest-priority source of truth.
- Preserve brand_name, business_context, hard_constraints, things_to_avoid, existing_visual_ideas, and every confirmed correction exactly.
- Never reuse an ai_inference whose status is invalidated.
- Never create a hard constraint. hard_constraints may only copy explicit confirmed hard constraints.
- You may classify additional audience, feelings, differentiator, or soft preferences only when the exact phrase appears in confirmed facts, voluntary context, adaptive answers, or user edits.
- Do not invent demographics, pricing, geography, category claims, or positioning.
- Preserve creative tensions such as "premium but playful" as coexisting signal.
- Put genuinely missing information in unknowns instead of guessing.
- Return only the strict JSON schema.`;
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (!Array.isArray(data?.output)) return "";
  for (const item of data.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const part of item.content) {
      const text = part?.text ?? part?.output_text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return "";
}

async function attemptInternalBrandBriefLLM(confirmed) {
  const cfg = getStrategistConfig();
  if (!cfg.enabled) return { ok: false, failure: "disabled" };
  if (!cfg.apiKey || !cfg.model || !cfg.baseUrl) return { ok: false, failure: "misconfigured" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);
  let response;
  try {
    response = await fetch(`${cfg.baseUrl}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        instructions: buildStrategistInstructions(),
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(confirmed) }] }],
        text: {
          format: {
            type: "json_schema",
            name: "internal_brand_brief",
            schema: outputSchema,
            strict: true,
          },
        },
        store: false,
        max_output_tokens: 2_400,
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, failure: "timeout" };
    return { ok: false, failure: "network" };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      failure: "http",
      status: response.status,
      detail: body.slice(0, 500),
    };
  }
  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, failure: "fetch_json" };
  }
  const outputText = extractOutputText(data);
  if (!outputText) return { ok: false, failure: "empty" };
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    return { ok: false, failure: "parse" };
  }
  const brief = normalizeStrategistBrief(parsed, confirmed);
  return brief ? { ok: true, brief } : { ok: false, failure: "coverage" };
}

async function generateInternalBrandBrief(confirmed) {
  const result = await attemptInternalBrandBriefLLM(confirmed);
  if (result.ok) return { source: "ai", coveragePassed: true, brief: result.brief };
  const brief = buildDeterministicInternalBrief(confirmed);
  return {
    source: "deterministic_fallback",
    failure: result.failure,
    coveragePassed: Object.values(brief.coverage).every(Boolean),
    brief,
  };
}

module.exports = {
  CONTRACT_VERSION,
  getStrategistConfig,
  buildDeterministicInternalBrief,
  computeCoverage,
  isGroundedInConfirmed,
  normalizeStrategistBrief,
  attemptInternalBrandBriefLLM,
  generateInternalBrandBrief,
};

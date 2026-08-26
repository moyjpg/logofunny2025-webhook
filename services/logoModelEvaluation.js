const crypto = require("crypto");

const MODEL_EVALUATION_VERSION = "logo_model_evaluation.v1";
const EVALUATION_MODE = "internal_blind_only";

const PROVIDERS = {
  ideogram_v3_quality: {
    id: "ideogram_v3_quality",
    display_name: "Raster baseline",
    output_type: "png",
    commercial_status: "baseline",
  },
  recraft_v4_1_vector: {
    id: "recraft_v4_1_vector",
    display_name: "Editable vector candidate",
    output_type: "svg",
    commercial_status: "candidate",
  },
};

const SCORECARD = [
  {
    id: "name_fidelity",
    label: "Exact brand name",
    max_score: 30,
    hard_fail: true,
    prompt: "Is every requested Latin character correct and readable?",
  },
  {
    id: "requested_structure",
    label: "Requested logo structure",
    max_score: 25,
    hard_fail: true,
    prompt: "Does it deliver the selected format, especially symbol + name when requested?",
  },
  {
    id: "small_scale_legibility",
    label: "Small-size legibility",
    max_score: 15,
    hard_fail: false,
    prompt: "Would it still read clearly at 24px and 48px?",
  },
  {
    id: "brand_fit_and_distinctiveness",
    label: "Brand fit and distinctiveness",
    max_score: 20,
    hard_fail: false,
    prompt: "Does it fit the confirmed brief without looking generic or derivative?",
  },
  {
    id: "color_and_application",
    label: "Color and application readiness",
    max_score: 10,
    hard_fail: false,
    prompt: "Would the color and contrast work on common brand surfaces?",
  },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBrief(raw) {
  if (!isPlainObject(raw) || raw.contract_version !== "internal_brand_brief.v1") return null;
  if (typeof raw.brand_name !== "string" || !raw.brand_name.trim()) return null;
  if (typeof raw.business_context !== "string" || !raw.business_context.trim()) return null;

  return {
    contract_version: raw.contract_version,
    source_confirmed_direction_hash: typeof raw.source_confirmed_direction_hash === "string"
      ? raw.source_confirmed_direction_hash
      : null,
    brand_name: raw.brand_name.trim(),
    business_context: raw.business_context.trim(),
    desired_feelings: Array.isArray(raw.desired_feelings) ? raw.desired_feelings : [],
    undesired_feelings: Array.isArray(raw.undesired_feelings) ? raw.undesired_feelings : [],
    hard_constraints: Array.isArray(raw.hard_constraints) ? raw.hard_constraints : [],
    soft_preferences: Array.isArray(raw.soft_preferences) ? raw.soft_preferences : [],
  };
}

function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));
    [result[index], result[otherIndex]] = [result[otherIndex], result[index]];
  }
  return result;
}

function buildEvaluationRun(rawBrief, { providers, random } = {}) {
  const brief = normalizeBrief(rawBrief);
  if (!brief) return null;

  const providerIds = providers || ["ideogram_v3_quality", "recraft_v4_1_vector"];
  if (!Array.isArray(providerIds) || providerIds.length !== 2) return null;
  if (new Set(providerIds).size !== providerIds.length || providerIds.some((id) => !PROVIDERS[id])) return null;

  const orderedProviders = shuffled(providerIds, random);
  const createdAt = new Date().toISOString();
  const candidates = orderedProviders.map((providerId, index) => ({
    candidate_id: String.fromCharCode(65 + index),
    provider_id: providerId,
    expected_output_type: PROVIDERS[providerId].output_type,
    status: "not_invoked",
  }));

  return {
    contract_version: MODEL_EVALUATION_VERSION,
    evaluation_id: crypto.randomUUID(),
    created_at: createdAt,
    mode: EVALUATION_MODE,
    accounting: {
      user_credits_charged: 0,
      creation_saved: false,
      automatic_generation: false,
    },
    source: {
      internal_brand_brief_version: brief.contract_version,
      source_confirmed_direction_hash: brief.source_confirmed_direction_hash,
      brand_name: brief.brand_name,
      business_context: brief.business_context,
      desired_feelings: brief.desired_feelings,
      undesired_feelings: brief.undesired_feelings,
      hard_constraints: brief.hard_constraints,
      soft_preferences: brief.soft_preferences,
    },
    operator_manifest: {
      keep_private_from_raters: true,
      candidates,
    },
    rater_packet: {
      instructions: [
        "Score candidates without seeing the provider name or price.",
        "Any incorrect brand spelling or missed required logo structure is a hard fail.",
        "Use two independent raters before comparing scores.",
      ],
      candidates: candidates.map(({ candidate_id, expected_output_type }) => ({
        candidate_id,
        expected_output_type,
      })),
      scorecard: SCORECARD,
      pass_rule: {
        minimum_total_score: 80,
        no_hard_fail: true,
      },
    },
  };
}

function normalizeScore(rawScore) {
  if (!isPlainObject(rawScore)) return null;
  const candidateId = typeof rawScore.candidate_id === "string" ? rawScore.candidate_id.trim() : "";
  if (!/^[A-B]$/.test(candidateId) || !isPlainObject(rawScore.scores)) return null;

  const scores = {};
  let total = 0;
  for (const criterion of SCORECARD) {
    const score = Number(rawScore.scores[criterion.id]);
    if (!Number.isInteger(score) || score < 0 || score > criterion.max_score) return null;
    scores[criterion.id] = score;
    total += score;
  }

  const hardFails = Array.isArray(rawScore.hard_fails)
    ? rawScore.hard_fails.filter((id) => SCORECARD.some((criterion) => criterion.id === id && criterion.hard_fail))
    : [];

  return {
    candidate_id: candidateId,
    scores,
    total,
    hard_fails: Array.from(new Set(hardFails)),
    passes: total >= 80 && hardFails.length === 0,
  };
}

module.exports = {
  MODEL_EVALUATION_VERSION,
  EVALUATION_MODE,
  PROVIDERS,
  SCORECARD,
  normalizeBrief,
  buildEvaluationRun,
  normalizeScore,
};

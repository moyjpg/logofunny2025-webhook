const assert = require("assert");
const {
  buildEvaluationRun,
  normalizeScore,
} = require("../services/logoModelEvaluation");
const {
  RECRAFT_VECTOR_ENDPOINT,
  RECRAFT_VECTOR_MODEL,
  buildRecraftVectorPrompt,
  generateRecraftVectorSmokeTest,
} = require("../services/recraftEvaluationService");

const brief = {
  contract_version: "internal_brand_brief.v1",
  source_confirmed_direction_hash: "a".repeat(64),
  brand_name: "LogoFunny",
  business_context: "A friendly AI logo studio for founders and small teams.",
  desired_feelings: ["professional", "reliable", "lively"],
  undesired_feelings: ["childish"],
  hard_constraints: ["Use the exact English brand name LogoFunny."],
  soft_preferences: ["symbol + name"],
};

const evaluation = buildEvaluationRun(brief, {
  random: () => 0,
});
assert(evaluation);
assert.equal(evaluation.accounting.user_credits_charged, 0);
assert.equal(evaluation.accounting.creation_saved, false);
assert.equal(evaluation.operator_manifest.candidates.length, 2);
assert.equal(evaluation.rater_packet.candidates.length, 2);
assert.equal(evaluation.rater_packet.scorecard.reduce((total, item) => total + item.max_score, 0), 100);
assert.notDeepEqual(evaluation.operator_manifest.candidates, evaluation.rater_packet.candidates);

const passing = normalizeScore({
  candidate_id: "A",
  scores: {
    name_fidelity: 30,
    requested_structure: 25,
    small_scale_legibility: 12,
    brand_fit_and_distinctiveness: 16,
    color_and_application: 8,
  },
  hard_fails: [],
});
assert(passing);
assert.equal(passing.total, 91);
assert.equal(passing.passes, true);

const hardFail = normalizeScore({
  candidate_id: "B",
  scores: {
    name_fidelity: 20,
    requested_structure: 25,
    small_scale_legibility: 15,
    brand_fit_and_distinctiveness: 20,
    color_and_application: 10,
  },
  hard_fails: ["name_fidelity"],
});
assert(hardFail);
assert.equal(hardFail.total, 90);
assert.equal(hardFail.passes, false);

assert.equal(normalizeScore({ candidate_id: "A", scores: {} }), null);
assert.equal(buildEvaluationRun({ brand_name: "OOPTRA" }), null);

const recraftPrompt = buildRecraftVectorPrompt(brief);
assert(recraftPrompt.includes("Exact wordmark: LogoFunny"));
assert(recraftPrompt.includes("symbol plus name"));

const originalRecraftToken = process.env.RECRAFT_API_TOKEN;
process.env.RECRAFT_API_TOKEN = "test-token";
let capturedRequest;
generateRecraftVectorSmokeTest(brief, {
  fetchImpl: async (url, request) => {
    capturedRequest = { url, request };
    return {
      ok: true,
      json: async () => ({ data: [{ url: "https://example.test/logo.svg" }] }),
    };
  },
}).then((result) => {
  assert.equal(capturedRequest.url, RECRAFT_VECTOR_ENDPOINT);
  assert.equal(capturedRequest.request.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(capturedRequest.request.body).model, RECRAFT_VECTOR_MODEL);
  assert.equal(result.output_type, "svg");
  assert.equal(result.accounting.estimated_recraft_api_units, 80);
  console.log("logo model blind evaluation contract checks passed");
}).finally(() => {
  if (originalRecraftToken === undefined) delete process.env.RECRAFT_API_TOKEN;
  else process.env.RECRAFT_API_TOKEN = originalRecraftToken;
});

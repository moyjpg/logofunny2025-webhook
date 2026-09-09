const assert = require("assert");

const { getFollowupConfig } = require("../services/onboardingFollowupService");
const { getSummaryConfig } = require("../services/onboardingSummaryService");
const { getStrategistConfig } = require("../services/internalBrandBriefService");
const { getCreativeDirectionsConfig } = require("../services/creativeDirectionsService");
const { getImageAnalysisConfig } = require("../services/onboardingImageAnalysisService");
const { getResearchConfig } = require("../services/onboardingResearchService");

const modelKeys = [
  "ONBOARDING_CONVERSATION_MODEL",
  "ONBOARDING_SUMMARY_MODEL",
  "ONBOARDING_STRATEGIST_MODEL",
  "ONBOARDING_CREATIVE_DIRECTIONS_MODEL",
  "ONBOARDING_IMAGE_ANALYSIS_MODEL",
  "ONBOARDING_RESEARCH_MODEL",
];
const flagKeys = ["ONBOARDING_FOLLOWUP_ENABLED", "ONBOARDING_SUMMARY_ENABLED"];
const previous = Object.fromEntries(modelKeys.map((key) => [key, process.env[key]]));
const previousFlags = Object.fromEntries(flagKeys.map((key) => [key, process.env[key]]));

try {
  for (const key of modelKeys) delete process.env[key];
  for (const key of flagKeys) delete process.env[key];

  assert.equal(getFollowupConfig().model, "gpt-5.6-luna");
  assert.equal(getSummaryConfig().model, "gpt-5.6-luna");
  assert.equal(getStrategistConfig().model, "gpt-5.6-terra");
  assert.equal(getCreativeDirectionsConfig().model, "gpt-5.6-terra");
  assert.equal(getImageAnalysisConfig().model, "gpt-5.6-terra");
  assert.equal(getResearchConfig().model, "gpt-5.6-luna");

  process.env.ONBOARDING_FOLLOWUP_ENABLED = "true";
  assert.equal(getSummaryConfig().enabled, true);
  process.env.ONBOARDING_SUMMARY_ENABLED = "false";
  assert.equal(getSummaryConfig().enabled, false);
  process.env.ONBOARDING_SUMMARY_ENABLED = "true";
  assert.equal(getSummaryConfig().enabled, true);

  process.env.ONBOARDING_CONVERSATION_MODEL = "conversation-override";
  process.env.ONBOARDING_SUMMARY_MODEL = "summary-override";
  process.env.ONBOARDING_STRATEGIST_MODEL = "strategist-override";

  assert.equal(getFollowupConfig().model, "conversation-override");
  assert.equal(getSummaryConfig().model, "summary-override");
  assert.equal(getStrategistConfig().model, "strategist-override");
  assert.equal(getCreativeDirectionsConfig().model, "strategist-override");
} finally {
  for (const key of modelKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
  for (const key of flagKeys) {
    if (previousFlags[key] === undefined) delete process.env[key];
    else process.env[key] = previousFlags[key];
  }
}

console.log("onboarding model config checks passed");

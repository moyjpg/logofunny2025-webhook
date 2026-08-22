"use strict";

const assert = require("node:assert/strict");
const { normalizeAnalysis } = require("../services/onboardingImageAnalysisService");

const providerResult = {
  observed_summary: "A rough black line drawing combining two angled letter-like forms.",
  visible_elements: ["two crossing strokes", "open center"],
  composition: "Centered and compact.",
  color_and_finish: "Single-color pencil sketch.",
  inferred_intent: "The user may want a compact monogram that feels energetic.",
  confidence: "medium",
  alternative_readings: ["It could also be an abstract fork-like symbol."],
  preserve: ["the open center", "the upward movement"],
  refine: ["make the stroke weight consistent"],
  avoid: ["tiny interior gaps"],
  generation_mode: "refine",
};

const owned = normalizeAnalysis(providerResult, "original_sketch");
assert.equal(owned.generation_mode, "refine");
assert.equal(owned.confidence, "medium");
assert.deepEqual(owned.preserve, ["the open center", "the upward movement"]);

const inspiration = normalizeAnalysis(providerResult, "inspiration_reference");
assert.equal(inspiration.generation_mode, "style_only");

const unsure = normalizeAnalysis(providerResult, "unsure");
assert.equal(unsure.generation_mode, "style_only");

assert.equal(normalizeAnalysis({ inferred_intent: "Missing observation" }, "owned_logo"), null);

console.log("onboardingImageAnalysisService tests passed");

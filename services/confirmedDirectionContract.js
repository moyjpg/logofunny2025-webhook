const crypto = require("crypto");

const CONFIRMED_DIRECTION_VERSION = "confirmed_direction.v1";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maxLength, { allowEmpty = true } = {}) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > maxLength || (!allowEmpty && !text)) return undefined;
  return text;
}

function nullableString(value, maxLength) {
  if (value === null) return null;
  return boundedString(value, maxLength, { allowEmpty: false });
}

function stringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const out = [];
  for (const item of value) {
    const text = boundedString(item, maxLength, { allowEmpty: false });
    if (text === undefined) return undefined;
    out.push(text);
  }
  return out;
}

function isIsoDateTime(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function normalizeConfirmedDirection(raw) {
  if (!isRecord(raw) || raw.contract_version !== CONFIRMED_DIRECTION_VERSION) return null;
  if (!isRecord(raw.facts) || !isRecord(raw.constraints) || !isRecord(raw.advanced_choices)) return null;
  if (!isRecord(raw.provenance)) return null;

  const requestId = boundedString(raw.request_id, 128, { allowEmpty: false });
  const confirmedAt = boundedString(raw.confirmed_at, 80, { allowEmpty: false });
  const brandName = boundedString(raw.facts.brand_name, 120, { allowEmpty: false });
  const businessContext = boundedString(raw.facts.business_context, 2_000, { allowEmpty: false });
  const audience = nullableString(raw.facts.audience, 1_000);
  const desiredFeelings = stringArray(raw.facts.desired_feelings, 20, 500);
  const undesiredFeelings = stringArray(raw.facts.undesired_feelings, 20, 1_200);
  const existingVisualIdeas = stringArray(raw.facts.existing_visual_ideas, 20, 1_000);
  const visualStyleLeaning = nullableString(raw.facts.visual_style_leaning, 500);
  const mainDirection = nullableString(raw.facts.main_direction, 1_200);
  const hard = stringArray(raw.constraints.hard, 30, 1_200);
  const soft = stringArray(raw.constraints.soft, 30, 1_200);
  const thingsToAvoid = stringArray(raw.constraints.things_to_avoid, 30, 1_200);

  if (
    requestId === undefined ||
    confirmedAt === undefined || !isIsoDateTime(confirmedAt) ||
    brandName === undefined ||
    !/[A-Za-z0-9]/.test(brandName) ||
    !/^[A-Za-z0-9 &'().,+\-]+$/.test(brandName) ||
    businessContext === undefined ||
    audience === undefined ||
    desiredFeelings === undefined ||
    undesiredFeelings === undefined ||
    existingVisualIdeas === undefined ||
    visualStyleLeaning === undefined ||
    mainDirection === undefined ||
    hard === undefined ||
    soft === undefined ||
    thingsToAvoid === undefined
  ) return null;

  const advancedKeys = [
    "visual_style",
    "color_preference",
    "color_description",
    "existing_visual_idea_preference",
    "logo_structure",
    "icon_direction",
    "detail_level",
    "typography",
  ];
  const advancedChoices = {};
  for (const key of advancedKeys) {
    const maxLength = key === "color_description" ? 500 : 120;
    const value = boundedString(raw.advanced_choices[key], maxLength);
    if (value === undefined) return null;
    advancedChoices[key] = value;
  }

  const rawUserInput = raw.provenance.raw_user_input;
  if (!isRecord(rawUserInput)) return null;
  const rawBrand = boundedString(rawUserInput.brand_name, 120);
  const rawBusiness = boundedString(rawUserInput.business_description, 2_000);
  const rawFeeling = boundedString(rawUserInput.rough_feeling, 500);
  const voluntaryContext = boundedString(raw.provenance.voluntary_extra_context, 12_000);
  if ([rawBrand, rawBusiness, rawFeeling, voluntaryContext].some((value) => value === undefined)) return null;

  if (!Array.isArray(raw.provenance.adaptive_answers) || raw.provenance.adaptive_answers.length > 5) return null;
  const adaptiveAnswers = [];
  for (const item of raw.provenance.adaptive_answers) {
    if (!isRecord(item)) return null;
    const id = boundedString(item.id, 120);
    const question = boundedString(item.question, 300);
    const answer = boundedString(item.answer, 1_000);
    if ([id, question, answer].some((value) => value === undefined)) return null;
    adaptiveAnswers.push({ id, question, answer });
  }

  if (!Array.isArray(raw.provenance.ai_inferences) || raw.provenance.ai_inferences.length > 100) return null;
  const aiInferences = [];
  const inferenceIds = new Set();
  for (const item of raw.provenance.ai_inferences) {
    if (!isRecord(item)) return null;
    const id = boundedString(item.id, 160, { allowEmpty: false });
    const field = boundedString(item.field, 120, { allowEmpty: false });
    const value = boundedString(item.value, 1_200, { allowEmpty: false });
    const confidence = Number(item.confidence);
    if (
      id === undefined || field === undefined || value === undefined ||
      !Number.isFinite(confidence) || confidence < 0 || confidence > 1 ||
      (item.status !== "active" && item.status !== "invalidated") ||
      inferenceIds.has(id)
    ) return null;
    inferenceIds.add(id);
    aiInferences.push({ id, field, value, confidence, status: item.status });
  }

  if (!Array.isArray(raw.provenance.user_summary_edits) || raw.provenance.user_summary_edits.length > 100) return null;
  const userSummaryEdits = [];
  for (const item of raw.provenance.user_summary_edits) {
    if (!isRecord(item)) return null;
    const field = boundedString(item.field, 120, { allowEmpty: false });
    const previousValue = boundedString(item.previous_value, 2_000);
    const newValue = boundedString(item.new_value, 2_000);
    const editedAt = boundedString(item.edited_at, 80, { allowEmpty: false });
    const invalidatedIds = stringArray(item.invalidated_inference_ids, 100, 160);
    const allowedSource = ["user", "ai_inferred", "user_edited", "advanced_choice"].includes(item.previous_source);
    if (
      field === undefined || previousValue === undefined || newValue === undefined ||
      editedAt === undefined || !isIsoDateTime(editedAt) || invalidatedIds === undefined || !allowedSource
    ) return null;
    userSummaryEdits.push({
      field,
      previous_value: previousValue,
      previous_source: item.previous_source,
      new_value: newValue,
      edited_at: editedAt,
      invalidated_inference_ids: invalidatedIds,
    });
  }

  if (!Array.isArray(raw.provenance.resolved_conflicts) || raw.provenance.resolved_conflicts.length > 50) return null;
  const resolvedConflicts = [];
  for (const item of raw.provenance.resolved_conflicts) {
    if (!isRecord(item)) return null;
    const id = boundedString(item.id, 180, { allowEmpty: false });
    const field = boundedString(item.field, 120, { allowEmpty: false });
    const userStatement = boundedString(item.user_statement, 1_200, { allowEmpty: false });
    const advancedChoiceLabel = boundedString(item.advanced_choice_label, 300, { allowEmpty: false });
    const resolvedAt = boundedString(item.resolved_at, 80, { allowEmpty: false });
    const allowedResolution = item.resolution === "kept_user_statement" || item.resolution === "used_advanced_choice";
    if (
      id === undefined || field === undefined || userStatement === undefined ||
      advancedChoiceLabel === undefined || resolvedAt === undefined || !isIsoDateTime(resolvedAt) || !allowedResolution
    ) return null;
    resolvedConflicts.push({
      id,
      field,
      user_statement: userStatement,
      advanced_choice_label: advancedChoiceLabel,
      resolution: item.resolution,
      resolved_at: resolvedAt,
    });
  }

  return {
    contract_version: CONFIRMED_DIRECTION_VERSION,
    request_id: requestId,
    facts: {
      brand_name: brandName,
      business_context: businessContext,
      audience,
      desired_feelings: desiredFeelings,
      undesired_feelings: undesiredFeelings,
      existing_visual_ideas: existingVisualIdeas,
      visual_style_leaning: visualStyleLeaning,
      main_direction: mainDirection,
    },
    constraints: { hard, soft, things_to_avoid: thingsToAvoid },
    advanced_choices: advancedChoices,
    provenance: {
      raw_user_input: {
        brand_name: rawBrand,
        business_description: rawBusiness,
        rough_feeling: rawFeeling,
      },
      voluntary_extra_context: voluntaryContext,
      adaptive_answers: adaptiveAnswers,
      ai_inferences: aiInferences,
      user_summary_edits: userSummaryEdits,
      resolved_conflicts: resolvedConflicts,
    },
    confirmed_at: confirmedAt,
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashConfirmedDirection(confirmedDirection) {
  return crypto.createHash("sha256").update(stableStringify(confirmedDirection)).digest("hex");
}

module.exports = {
  CONFIRMED_DIRECTION_VERSION,
  normalizeConfirmedDirection,
  stableStringify,
  hashConfirmedDirection,
};

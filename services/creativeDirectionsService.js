// Layer 4 only: internal_brand_brief.v1 -> creative_directions.v1.
// This service develops four strategic visual routes. It never produces
// provider prompts, images, rankings, or credit-affecting work.

const crypto = require("crypto");
const fetch = require("node-fetch");
const creativeDirectionsSchema = require("../contracts/creative-directions.v1.schema.json");

const CONTRACT_VERSION = "creative_directions.v1";
const BRIEF_VERSION = "internal_brand_brief.v1";
const DEFAULT_TIMEOUT_MS = 35_000;
const outputSchema = { ...creativeDirectionsSchema };
delete outputSchema.$schema;
delete outputSchema.$id;

function getCreativeDirectionsConfig() {
  const timeoutRaw = Number.parseInt(process.env.ONBOARDING_CREATIVE_DIRECTIONS_FETCH_TIMEOUT_MS || "", 10);
  return {
    enabled: String(process.env.ONBOARDING_CREATIVE_DIRECTIONS_ENABLED || "").toLowerCase() === "true",
    apiKey:
      process.env.ONBOARDING_CREATIVE_DIRECTIONS_API_KEY ||
      process.env.ONBOARDING_STRATEGIST_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "",
    baseUrl: (process.env.ONBOARDING_CREATIVE_DIRECTIONS_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model:
      process.env.ONBOARDING_CREATIVE_DIRECTIONS_MODEL ||
      process.env.ONBOARDING_STRATEGIST_MODEL ||
      "gpt-5.6-terra",
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function cleanString(value, maxLength, required = false) {
  if (typeof value !== "string") return required ? null : "";
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > maxLength) return null;
  return cleaned;
}

function cleanStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const cleaned = cleanString(item, maxLength, true);
    if (cleaned === null) return null;
    const key = cleaned.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function normalizeInternalBrandBrief(value) {
  if (!isRecord(value) || value.contract_version !== BRIEF_VERSION) return null;
  if (!hasOnlyKeys(value, [
    "contract_version", "source_confirmed_direction_hash", "business_context", "brand_name", "audience",
    "desired_feelings", "undesired_feelings", "hard_constraints", "soft_preferences", "existing_visual_ideas",
    "differentiator", "things_to_avoid", "unknowns", "confidence", "coverage",
  ])) return null;
  const sourceHash = cleanString(value.source_confirmed_direction_hash, 128, true);
  const businessContext = cleanString(value.business_context, 3000, true);
  const brandName = cleanString(value.brand_name, 120, true);
  if (!sourceHash || !/^[a-f0-9]{64}$/.test(sourceHash) || !businessContext || !brandName) return null;

  const audience = value.audience === null ? null : cleanString(value.audience, 1000);
  const differentiator = value.differentiator === null ? null : cleanString(value.differentiator, 1200);
  if (audience === null && value.audience !== null) return null;
  if (differentiator === null && value.differentiator !== null) return null;

  const desiredFeelings = cleanStringArray(value.desired_feelings, 20, 500);
  const undesiredFeelings = cleanStringArray(value.undesired_feelings, 20, 1200);
  const hardConstraints = cleanStringArray(value.hard_constraints, 30, 1200);
  const softPreferences = cleanStringArray(value.soft_preferences, 30, 1200);
  const existingVisualIdeas = cleanStringArray(value.existing_visual_ideas, 20, 1000);
  const thingsToAvoid = cleanStringArray(value.things_to_avoid, 30, 1200);
  const unknowns = cleanStringArray(value.unknowns, 30, 500);
  if (
    !desiredFeelings || !undesiredFeelings || !hardConstraints || !softPreferences ||
    !existingVisualIdeas || !thingsToAvoid || !unknowns || !isRecord(value.confidence) || !isRecord(value.coverage)
  ) return null;

  const overall = value.confidence.overall;
  if (typeof overall !== "number" || !Number.isFinite(overall) || overall < 0 || overall > 1) return null;
  if (!hasOnlyKeys(value.confidence, ["overall", "by_field"])) return null;
  if (!Array.isArray(value.confidence.by_field) || value.confidence.by_field.length > 30) return null;
  const byField = [];
  for (const item of value.confidence.by_field) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["field", "confidence"])) return null;
    const field = cleanString(item.field, 120, true);
    if (!field || typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) return null;
    byField.push({ field, confidence: item.confidence });
  }

  const coverageKeys = [
    "hard_constraints_preserved",
    "negative_intent_preserved",
    "user_corrections_preserved",
    "unknowns_not_promoted_to_facts",
  ];
  if (!hasOnlyKeys(value.coverage, coverageKeys)) return null;
  if (coverageKeys.some((key) => value.coverage[key] !== true)) return null;

  return {
    contract_version: BRIEF_VERSION,
    source_confirmed_direction_hash: sourceHash,
    business_context: businessContext,
    brand_name: brandName,
    audience: audience || null,
    desired_feelings: desiredFeelings,
    undesired_feelings: undesiredFeelings,
    hard_constraints: hardConstraints,
    soft_preferences: softPreferences,
    existing_visual_ideas: existingVisualIdeas,
    differentiator: differentiator || null,
    things_to_avoid: thingsToAvoid,
    unknowns,
    confidence: { overall, by_field: byField },
    coverage: Object.fromEntries(coverageKeys.map((key) => [key, true])),
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = canonicalize(value[key]);
    return out;
  }, {});
}

function hashInternalBrandBrief(brief) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(brief))).digest("hex");
}

function allIncluded(required, actual) {
  const actualSet = new Set(actual);
  return required.every((item) => actualSet.has(item));
}

function normalizeForDistinctness(value) {
  // Keep letters and numbers from every writing system. The former ASCII-only
  // filter reduced Chinese/Japanese/Spanish routes to an empty signature, so
  // valid non-English directions were incorrectly rejected as duplicates.
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function directionsAreDistinct(directions) {
  const signatures = directions.map((direction) => normalizeForDistinctness([
    direction.name,
    direction.core_idea,
    direction.symbol_strategy,
    direction.distinctive_move,
  ].join(" ")));
  return signatures.every((signature, index) =>
    signature.length > 0 && signatures.findIndex((candidate) => candidate === signature) === index
  );
}

function diagnoseCreativeDirectionsContract(value, brief) {
  if (!isRecord(value)) return "root_not_object";
  if (value.contract_version !== CONTRACT_VERSION) return "contract_version_mismatch";
  if (!Array.isArray(value.directions)) return "directions_not_array";
  if (!hasOnlyKeys(value, [
    "contract_version", "source_internal_brand_brief_hash", "brand_name", "directions", "coverage",
  ])) return "unexpected_root_key";
  if (value.source_internal_brand_brief_hash !== hashInternalBrandBrief(brief)) return "source_hash_mismatch";
  if (value.brand_name !== brief.brand_name) return "brand_name_mismatch";
  if (value.directions.length !== 4) return "direction_count";

  const normalized = [];
  for (let index = 0; index < value.directions.length; index += 1) {
    const raw = value.directions[index];
    const label = `direction_${index + 1}`;
    if (!isRecord(raw)) return `${label}_not_object`;
    if (raw.id !== label) return `${label}_id_mismatch`;
    if (!hasOnlyKeys(raw, [
      "id", "name", "core_idea", "brand_signal", "symbol_strategy", "typography_strategy", "color_strategy",
      "composition_strategy", "distinctive_move", "constraints_applied", "avoid", "confidence",
    ])) return `${label}_unexpected_key`;

    const textFields = [
      ["name", 80], ["core_idea", 700], ["brand_signal", 500], ["symbol_strategy", 700],
      ["typography_strategy", 700], ["color_strategy", 700], ["composition_strategy", 700],
      ["distinctive_move", 500],
    ];
    for (const [field, limit] of textFields) {
      if (cleanString(raw[field], limit, true) === null) return `${label}_${field}_invalid`;
    }

    const modelConstraints = cleanStringArray(raw.constraints_applied, 30, 1200);
    const modelAvoid = cleanStringArray(raw.avoid, 50, 1200);
    if (!modelConstraints) return `${label}_constraints_invalid`;
    if (!modelAvoid) return `${label}_avoid_invalid`;
    if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) {
      return `${label}_confidence_invalid`;
    }
    normalized.push(raw);
  }
  if (!directionsAreDistinct(normalized)) return "directions_not_distinct";
  return "unknown_contract_failure";
}

function normalizeCreativeDirections(value, brief) {
  if (!isRecord(value) || value.contract_version !== CONTRACT_VERSION || !Array.isArray(value.directions)) return null;
  if (!hasOnlyKeys(value, [
    "contract_version", "source_internal_brand_brief_hash", "brand_name", "directions", "coverage",
  ])) return null;
  if (value.source_internal_brand_brief_hash !== hashInternalBrandBrief(brief) || value.brand_name !== brief.brand_name) return null;
  if (value.directions.length !== 4) return null;

  const requiredAvoid = Array.from(new Set([...brief.undesired_feelings, ...brief.things_to_avoid]));
  const directions = [];
  for (let index = 0; index < value.directions.length; index += 1) {
    const raw = value.directions[index];
    if (!isRecord(raw)) return null;
    const expectedId = `direction_${index + 1}`;
    if (raw.id !== expectedId || !hasOnlyKeys(raw, [
      "id", "name", "core_idea", "brand_signal", "symbol_strategy", "typography_strategy", "color_strategy",
      "composition_strategy", "distinctive_move", "constraints_applied", "avoid", "confidence",
    ])) return null;
    const fields = {
      name: cleanString(raw.name, 80, true),
      core_idea: cleanString(raw.core_idea, 700, true),
      brand_signal: cleanString(raw.brand_signal, 500, true),
      symbol_strategy: cleanString(raw.symbol_strategy, 700, true),
      typography_strategy: cleanString(raw.typography_strategy, 700, true),
      color_strategy: cleanString(raw.color_strategy, 700, true),
      composition_strategy: cleanString(raw.composition_strategy, 700, true),
      distinctive_move: cleanString(raw.distinctive_move, 500, true),
    };
    if (Object.values(fields).some((field) => field === null)) return null;
    const modelConstraints = cleanStringArray(raw.constraints_applied, 30, 1200);
    const modelAvoid = cleanStringArray(raw.avoid, 50, 1200);
    if (!modelConstraints || !modelAvoid) return null;
    if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) return null;

    directions.push({
      id: expectedId,
      ...fields,
      // These are authoritative gates, not model-authored paraphrases. Exact
      // brief wording is carried into every direction to prevent drift.
      constraints_applied: [...brief.hard_constraints],
      avoid: [...requiredAvoid],
      confidence: raw.confidence,
    });
  }

  const coverage = {
    source_brief_verified: true,
    hard_constraints_applied_to_every_direction: directions.every((direction) =>
      allIncluded(brief.hard_constraints, direction.constraints_applied)
    ),
    negative_intent_applied_to_every_direction: directions.every((direction) =>
      allIncluded(requiredAvoid, direction.avoid)
    ),
    directions_are_distinct: directionsAreDistinct(directions),
  };
  if (!Object.values(coverage).every(Boolean)) return null;

  return {
    contract_version: CONTRACT_VERSION,
    source_internal_brand_brief_hash: hashInternalBrandBrief(brief),
    brand_name: brief.brand_name,
    directions,
    coverage,
  };
}

function buildCreativeDirectionsInstructions() {
  return `You are LogoFunny's Creative Director. Create exactly four materially different visual identity routes from the supplied Internal Brand Brief.

This is Layer 4 only. Do not write image-model prompts, negative prompts, SVG instructions, rendered logos, scores between providers, or implementation code.

Rules:
- Treat the Internal Brand Brief as the complete source of truth. Do not invent audience, geography, pricing, product features, brand history, or market position.
- Preserve creative tensions instead of flattening them. Each direction must solve the same brief through a clearly different central idea and visual system.
- Make each route specific enough for a later prompt-builder: symbol logic, type character, color role, composition, and one distinctive move.
- Do not default every brand to a generic symbol-plus-wordmark, gradient, monogram, mascot, or geometric icon.
- Do not repeat the same idea with cosmetic color changes.
- Respect every hard constraint and every item in things_to_avoid and undesired_feelings.
- Unknown information stays unknown. Never fill a missing audience, differentiator, or visual idea with a guess.
- Copy source_internal_brand_brief_hash and brand_name exactly from the input envelope.
- constraints_applied and avoid must copy the exact relevant strings from the brief. They will be enforced again server-side.
- Use direction_1 through direction_4 in array order.
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

async function attemptCreativeDirectionsLLM(brief) {
  const cfg = getCreativeDirectionsConfig();
  if (!cfg.enabled) return { ok: false, failure: "disabled" };
  if (!cfg.apiKey || !cfg.model || !cfg.baseUrl) return { ok: false, failure: "misconfigured" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);
  let response;
  try {
    response = await fetch(`${cfg.baseUrl}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        instructions: buildCreativeDirectionsInstructions(),
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              source_internal_brand_brief_hash: hashInternalBrandBrief(brief),
              internal_brand_brief: brief,
            }),
          }],
        }],
        text: { format: { type: "json_schema", name: "creative_directions", schema: outputSchema, strict: true } },
        store: false,
        max_output_tokens: 4_800,
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
  const directions = normalizeCreativeDirections(parsed, brief);
  return directions
    ? { ok: true, directions }
    : { ok: false, failure: "contract", detail: diagnoseCreativeDirectionsContract(parsed, brief) };
}

async function generateCreativeDirections(rawBrief) {
  const brief = normalizeInternalBrandBrief(rawBrief);
  if (!brief) return { ok: false, failure: "invalid_brief" };
  const result = await attemptCreativeDirectionsLLM(brief);
  if (!result.ok) return result;
  return { ok: true, source: "ai", directions: result.directions };
}

module.exports = {
  CONTRACT_VERSION,
  getCreativeDirectionsConfig,
  normalizeInternalBrandBrief,
  hashInternalBrandBrief,
  directionsAreDistinct,
  diagnoseCreativeDirectionsContract,
  normalizeCreativeDirections,
  attemptCreativeDirectionsLLM,
  generateCreativeDirections,
};

// services/onboardingSummaryService.js — P0.4 isolated Layer 2 synthesis.
// Produces an editable, user-visible direction draft. It never builds the
// Internal Brand Brief, Creative Directions, model prompts, or logos.

const fetch = require("node-fetch");
const directionDraftSchema = require("../contracts/onboarding-direction-draft.v1.schema.json");

const CONTRACT_VERSION = "onboarding_direction_draft.v1";
const DEFAULT_TIMEOUT_MS = 20_000;
const INPUT_LIMITS = Object.freeze({
  brand_name: 120,
  business_description: 2_000,
  rough_feeling: 500,
  primary_use: 300,
  voluntary_extra_context: 12_000,
  adaptive_answers: 2,
  adaptive_question: 300,
  adaptive_answer: 1_000,
  conversation_language: 16,
});

function getSummaryConfig() {
  const timeoutRaw = Number.parseInt(process.env.ONBOARDING_SUMMARY_FETCH_TIMEOUT_MS || "", 10);
  return {
    enabled: String(process.env.ONBOARDING_SUMMARY_ENABLED || "").toLowerCase() === "true",
    apiKey: process.env.ONBOARDING_CONVERSATION_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.ONBOARDING_CONVERSATION_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    // Summary is a bounded, high-volume synthesis task and intentionally
    // shares the cost-sensitive conversation model unless explicitly split.
    model: process.env.ONBOARDING_SUMMARY_MODEL || process.env.ONBOARDING_CONVERSATION_MODEL || "gpt-5.6-luna",
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
  };
}

function cleanText(value, maxLength) {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  return text.slice(0, maxLength);
}

function normalizeOnboardingInput(input = {}) {
  const answers = Array.isArray(input.adaptive_answers)
    ? input.adaptive_answers.slice(0, INPUT_LIMITS.adaptive_answers)
    : [];

  return {
    brand_name: cleanText(input.brand_name, INPUT_LIMITS.brand_name),
    business_description: cleanText(input.business_description, INPUT_LIMITS.business_description),
    rough_feeling: cleanText(input.rough_feeling, INPUT_LIMITS.rough_feeling),
    primary_use: cleanText(input.primary_use, INPUT_LIMITS.primary_use),
    voluntary_extra_context: cleanText(
      input.voluntary_extra_context,
      INPUT_LIMITS.voluntary_extra_context
    ),
    conversation_language: ["en", "zh-CN", "es", "ja"].includes(input.conversation_language)
      ? input.conversation_language
      : "en",
    adaptive_answers: answers.map((item, index) => ({
      id: cleanText(item?.id || `followup_${index + 1}`, 120),
      question: cleanText(item?.question, INPUT_LIMITS.adaptive_question),
      answer: cleanText(item?.answer, INPUT_LIMITS.adaptive_answer),
    })).filter((item) => item.answer),
  };
}

function nullField() {
  return { value: null, source: null, inference_id: null, confidence: null };
}

function userField(value, maxLength = 1_200) {
  const clean = cleanText(value, maxLength);
  return clean
    ? { value: clean, source: "user", inference_id: null, confidence: null }
    : nullField();
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function findAdaptiveAnswer(input, patterns) {
  const hit = input.adaptive_answers.find((item) =>
    patterns.some((pattern) => pattern.test(item.question))
  );
  return hit?.answer || "";
}

function buildDeterministicDirectionDraft(rawInput = {}) {
  const input = normalizeOnboardingInput(rawInput);
  const audience = findAdaptiveAnswer(input, [/\bwho\b/i, /\baudience\b/i, /\bmainly for\b/i]);
  const adaptiveFeeling = findAdaptiveAnswer(input, [/\bfeel\b/i, /\bfeeling\b/i]);
  const avoidText = [input.voluntary_extra_context, ...input.adaptive_answers.map((item) => item.answer)]
    .flatMap(splitSentences)
    .filter((sentence) => /\b(avoid|no\s|not\s|never|don'?t|do not|without)\b/i.test(sentence))
    .filter((sentence, index, all) => all.indexOf(sentence) === index)
    .join(" ");

  return {
    contract_version: CONTRACT_VERSION,
    fields: {
      brand: userField(input.brand_name, INPUT_LIMITS.brand_name),
      business_context: userField(input.business_description, INPUT_LIMITS.business_description),
      audience: userField(audience, 1_000),
      how_it_should_feel: userField(input.rough_feeling || adaptiveFeeling, INPUT_LIMITS.rough_feeling),
      what_to_avoid: userField(avoidText),
      visual_style_leaning: nullField(),
      main_direction: nullField(),
    },
    ai_inferences: [],
  };
}

function buildSummaryInstructions() {
  return `You are LogoFunny's concise onboarding conversation assistant.

Turn the user's intake into a short, editable "Here's what I understood" draft. This is Layer 2 only: never create an Internal Brand Brief, Creative Directions, image prompts, or generation settings.

Hard rules:
- Preserve brand_name and business_description exactly as user facts. Never rewrite or embellish them.
- Write any inferred field in conversation_language, but never translate, transliterate, or rename brand_name.
- A literal rough_feeling or adaptive answer is a user fact, not an AI inference.
- how_it_should_feel must contain only emotional or experiential qualities explicitly stated by the user. If rough_feeling also contains layout, color, symbol, or exclusion instructions, keep those out of how_it_should_feel and place them in the appropriate fields without inventing details.
- Infer audience, visual style leaning, or main direction only when grounded in the supplied text. Otherwise return null fields.
- Never invent demographics, pricing position, geography, differentiators, or visual ideas.
- Treat creative tensions such as "premium but playful" and "friendly but not cute" as valid combined intent.
- what_to_avoid may contain only explicit negative intent from the user.
- Keep values plain-language and concise. Do not ask questions and do not use design-professional jargon.
- Every ai_inferred field must have a unique inference_id and confidence between 0 and 1. Copy the same records into ai_inferences with status "active".
- User fields must use source "user" with null inference_id and null confidence.
- Unknown fields must use null for value, source, inference_id, and confidence.`;
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

const FIELD_KEYS = [
  "brand",
  "business_context",
  "audience",
  "how_it_should_feel",
  "what_to_avoid",
  "visual_style_leaning",
  "main_direction",
];
const FIELD_LIMITS = Object.freeze({
  brand: INPUT_LIMITS.brand_name,
  business_context: INPUT_LIMITS.business_description,
  audience: 1_000,
  how_it_should_feel: INPUT_LIMITS.rough_feeling,
  what_to_avoid: 1_200,
  visual_style_leaning: 500,
  main_direction: 1_200,
});

function normalizeModelField(raw, maxLength = 1_200) {
  if (!raw || typeof raw !== "object") return nullField();
  const value = raw.value == null ? null : cleanText(raw.value, maxLength) || null;
  const source = raw.source === "user" || raw.source === "ai_inferred" ? raw.source : null;
  if (!value || !source) return nullField();
  if (source === "user") return userField(value, maxLength);
  const id = cleanText(raw.inference_id, 160);
  const confidence = Number(raw.confidence);
  if (!id || !Number.isFinite(confidence)) return nullField();
  return {
    value,
    source: "ai_inferred",
    inference_id: id,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

function normalizeDirectionDraft(parsed, input) {
  if (!parsed || typeof parsed !== "object" || parsed.contract_version !== CONTRACT_VERSION) return null;
  if (!parsed.fields || typeof parsed.fields !== "object") return null;

  const fields = {};
  for (const key of FIELD_KEYS) {
    fields[key] = normalizeModelField(parsed.fields[key], FIELD_LIMITS[key]);
  }

  // Literal user facts are authoritative even if the model attempted to rewrite them.
  // This includes adaptive answers and explicit negative intent recovered by
  // the deterministic pass, not only the three top-level intake fields.
  const factOnly = buildDeterministicDirectionDraft(input).fields;
  fields.brand = userField(input.brand_name, INPUT_LIMITS.brand_name);
  fields.business_context = userField(input.business_description, INPUT_LIMITS.business_description);
  if (factOnly.audience.value) fields.audience = factOnly.audience;
  if (factOnly.how_it_should_feel.value) {
    // The model may separate explicitly stated feelings from a compound reply
    // that also contains colors, symbols, layout, and negative constraints.
    // Keep that grounded user-field extraction; use the literal text only if
    // the model did not return a usable user field.
    if (fields.how_it_should_feel.source !== "user" || !fields.how_it_should_feel.value) {
      fields.how_it_should_feel = factOnly.how_it_should_feel;
    }
  }
  if (factOnly.what_to_avoid.value) fields.what_to_avoid = factOnly.what_to_avoid;

  const seen = new Set();
  const aiInferences = [];
  for (const key of FIELD_KEYS) {
    const field = fields[key];
    if (field.source !== "ai_inferred" || !field.inference_id) continue;
    if (seen.has(field.inference_id)) return null;
    seen.add(field.inference_id);
    aiInferences.push({
      id: field.inference_id,
      field: key,
      value: field.value,
      confidence: field.confidence,
      status: "active",
    });
  }

  return { contract_version: CONTRACT_VERSION, fields, ai_inferences: aiInferences };
}

async function attemptOnboardingSummaryLLM(rawInput = {}) {
  const cfg = getSummaryConfig();
  if (!cfg.enabled) return { ok: false, failure: "disabled" };
  if (!cfg.apiKey || !cfg.model || !cfg.baseUrl) return { ok: false, failure: "misconfigured" };

  const input = normalizeOnboardingInput(rawInput);
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
        instructions: buildSummaryInstructions(),
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] }],
        text: {
          format: {
            type: "json_schema",
            name: "onboarding_direction_draft",
            schema: directionDraftSchema,
            strict: true,
          },
        },
        store: false,
        max_output_tokens: 1_600,
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

  const draft = normalizeDirectionDraft(parsed, input);
  return draft ? { ok: true, draft } : { ok: false, failure: "invalid_shape" };
}

async function generateOnboardingSummary(rawInput = {}) {
  const input = normalizeOnboardingInput(rawInput);
  const result = await attemptOnboardingSummaryLLM(input);
  if (result.ok) return { source: "ai", draft: result.draft };
  return {
    source: "deterministic_fallback",
    failure: result.failure,
    draft: buildDeterministicDirectionDraft(input),
  };
}

module.exports = {
  CONTRACT_VERSION,
  INPUT_LIMITS,
  getSummaryConfig,
  normalizeOnboardingInput,
  buildDeterministicDirectionDraft,
  normalizeDirectionDraft,
  attemptOnboardingSummaryLLM,
  generateOnboardingSummary,
};

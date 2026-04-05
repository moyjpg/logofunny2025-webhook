// services/brandAdvisorService.js — OpenAI-compatible chat completion for Brand Advisor copy

const fetch = require("node-fetch");

const REQUIRED_JSON_KEYS = [
  "designRecommendation",
  "brandRead",
  "leadConceptWhy",
  "nextIterationBrief",
];

function getAdvisorConfig() {
  const enabled = String(process.env.BRAND_ADVISOR_ENABLED || "").toLowerCase() === "true";
  const provider = String(process.env.BRAND_ADVISOR_PROVIDER || "qwen").toLowerCase();
  return {
    enabled,
    provider: provider === "deepseek" ? "deepseek" : "qwen",
    apiKey: process.env.BRAND_ADVISOR_API_KEY || "",
    baseUrl: (process.env.BRAND_ADVISOR_BASE_URL || "").replace(/\/$/, ""),
    model: process.env.BRAND_ADVISOR_MODEL || "",
  };
}

function isAdvisorConfigured(cfg) {
  return Boolean(cfg.apiKey && cfg.baseUrl && cfg.model);
}

/**
 * Build prompt template — senior identity strategist, JSON output only.
 */
function buildAdvisorMessages(structured) {
  const system = `You are a senior brand identity strategist focused on logo systems, lockups, and wordmarks—not general marketing copy, taglines, or campaigns.

Output exactly one JSON object. No markdown, no code fences, no extra keys or commentary.

Required keys (string values only, exact names):
- designRecommendation
- brandRead
- leadConceptWhy
- nextIterationBrief

Evidence: infer from structured inputs when present—brandName, industry, keywords, logoStructure, brandStyleRoute, visualMood, colorDirection, typographyDirection, styleCues, otherNotes, designDecision, prompt. Treat the structured fields as primary; use prompt only as supporting context, not as a substitute for reasoning across fields.

Avoid generic phrases such as "modern and trustworthy", "clean and scalable", "professional and memorable", or similar filler unless a specific input clearly warrants that exact claim. Do not restate or lightly paraphrase the user's keywords as if that were strategic advice.
Do not mention visual traits that are not supported by the inputs or the lead concept (for example serif, monochrome, luxury, editorial, mascot, badge, gradient, or minimal icon) unless there is clear evidence in the structured fields.
Prefer specific observations about structure, tone, usability, and distinctiveness over abstract praise.

You must explicitly connect recommendations to the lead concept / Option 1 direction (the primary route the user is pursuing). Write concise, commercially credible English for design decisions: no hype, no fluff, no poetic filler, no marketing slogans. The reader is a designer or founder deciding whether to keep iterating on the current direction.

Field limits and intent:
- designRecommendation: 2–3 sentences max. Sentence 1 = strongest visual recommendation for the lead logo direction. Sentence 2 = what to emphasize or avoid in execution. Optional sentence 3 = how the concept should feel in use (e.g. digital UI, packaging, small sizes).
- brandRead: 1–2 sentences max. How the brand should be perceived by customers, specific and differentiated from generic category claims.
- leadConceptWhy: 1–2 sentences max. Why the lead concept / Option 1 is the best starting direction, grounded in structure, tone, readability, category fit, distinctiveness, or scalability.
- nextIterationBrief: 1–2 sentences max. Concrete iteration guidance (e.g. spacing, stroke weight, contrast, simplification, hierarchy, icon restraint, monochrome testing, favicon legibility, packaging or web constraints).

English only.`;

  const user = `This advice is for the lead logo direction aligned to Option 1 (the primary concept the user is pursuing).

Base your analysis on the structured data below as a whole. Do not rely mainly on repeating or summarizing the raw "prompt" field; synthesize across the structured fields. If inputs are sparse or some fields are empty, still produce the best grounded inference from what is present (including industry and any stated constraints)—do not output vague warnings about missing information or refuse to advise.

Structured inputs:
${JSON.stringify(structured, null, 2)}

Return only valid JSON with exactly these keys: {"designRecommendation":"","brandRead":"","leadConceptWhy":"","nextIterationBrief":""}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function extractJsonObject(text) {
  const t = String(text || "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeAdvisorOutput(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const out = {};
  for (const k of REQUIRED_JSON_KEYS) {
    const v = parsed[k];
    out[k] = typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
  }
  if (REQUIRED_JSON_KEYS.some((k) => !out[k])) return null;
  return out;
}

/**
 * @param {Record<string, unknown>} input — brandName, industry, keywords, etc.
 * @returns {Promise<{ designRecommendation: string, brandRead: string, leadConceptWhy: string, nextIterationBrief: string }>}
 */
async function generateBrandAdvisorCopy(input = {}) {
  const cfg = getAdvisorConfig();
  if (!cfg.enabled) {
    throw new Error("Brand advisor disabled");
  }
  if (!isAdvisorConfigured(cfg)) {
    throw new Error("Brand advisor missing API configuration");
  }

  const structured = {
    brandName: input.brandName,
    industry: input.industry,
    keywords: input.keywords,
    logoStructure: input.logoStructure,
    brandStyleRoute: input.brandStyleRoute,
    visualMood: input.visualMood,
    colorDirection: input.colorDirection,
    typographyDirection: input.typographyDirection,
    styleCues: input.styleCues,
    otherNotes: input.otherNotes,
    designDecision: input.designDecision,
    prompt: input.prompt,
    tagline: input.tagline,
  };

  const url = `${cfg.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: buildAdvisorMessages(structured),
      temperature: 0.45,
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brand advisor HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Brand advisor empty response");
  }

  const parsed = extractJsonObject(content);
  const normalized = normalizeAdvisorOutput(parsed);
  if (!normalized) {
    throw new Error("Brand advisor invalid JSON");
  }

  return normalized;
}

module.exports = {
  getAdvisorConfig,
  isAdvisorConfigured,
  generateBrandAdvisorCopy,
};

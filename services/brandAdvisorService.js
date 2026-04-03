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
 * Build prompt template — concise, commercial, JSON output only.
 */
function buildAdvisorMessages(structured) {
  const system = `You are a senior brand and logo strategist. Respond with one JSON object only, no markdown, no code fences.
Keys (exact names, string values, each 1–4 short sentences, no hype):
- designRecommendation: strongest logo direction for this brand
- brandRead: what kind of brand this is and how it should be perceived commercially
- leadConceptWhy: why that direction is the best starting point (practical, not fluff)
- nextIterationBrief: what to refine next iteration (spacing, contrast, simplicity, use-cases)

Rules: Infer from context; do not paste raw fields back verbatim. Be clear and commercially useful. English only.`;

  const user = `Brand context (structured):\n${JSON.stringify(structured, null, 2)}\n
Return only valid JSON: {"designRecommendation":"","brandRead":"","leadConceptWhy":"","nextIterationBrief":""}`;

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

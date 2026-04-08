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
 * Build prompt template — design-review style, JSON output only.
 */
function buildAdvisorMessages(structured) {
  const system = `You are a senior brand identity strategist giving a concise design review for a lead logo direction (Option 1). You focus on logo systems, not marketing copy.

Output exactly one JSON object only. No markdown, no code fences, no extra keys.
Required keys (string values, exact names):
- designRecommendation
- brandRead
- leadConceptWhy
- nextIterationBrief

Use these inputs when present: brandName, industry, keywords, logoStructure, brandStyleRoute, visualMood, colorDirection, typographyDirection, styleCues, otherNotes, designDecision, prompt, tagline.
Treat structured inputs as primary evidence. Do not just restate keywords or echo the prompt.

Tone and claim rules:
- Sound like a design director / brand strategist review: grounded, specific, slightly editorial.
- No hype, no fluff, no slogans, no poetic filler.
- Avoid unsupported claims about audience segment, pricing tier, conversion, or demographics unless explicitly provided.
- Use cautious language for category fit: "tends to suit", "usually works well for", "can support".

Map content to fields:
- designRecommendation: Lead Direction + Design Recommendation + concise Color Strategy + Typography Direction.
  Keep to 2-4 short sentences. Include actionable color usage (Primary/Secondary/Accent usage intent) when possible.
- brandRead: Why This Fits Your Category + Brand Signals to Emphasize + one Industry Pattern to Avoid.
  Keep to 2-3 short sentences and avoid hard market claims.
- leadConceptWhy: Why Option 1 is the right starting point + concise guardrail-style do/don't guidance.
  Keep to 1-3 short sentences.
- nextIterationBrief: action-oriented handoff note + Brand System Starter steps beyond the logo.
  Keep to 2-4 short sentences with practical checks (favicon, dark/light, spacing, stroke, contrast, hierarchy, simplification).

If data is sparse, still infer the most grounded direction from what exists.`;

  const user = `Brand advisor request for lead logo direction aligned to Option 1.
Use structured data first; do not rely mainly on repeating the raw prompt text.
If inputs are sparse, provide the best grounded design inference anyway (no generic warning-only response).

Structured inputs:
${JSON.stringify(structured, null, 2)}

Return only valid JSON with exactly these keys:
{"designRecommendation":"","brandRead":"","leadConceptWhy":"","nextIterationBrief":""}`;

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

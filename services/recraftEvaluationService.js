const { normalizeBrief } = require("./logoModelEvaluation");

const RECRAFT_VECTOR_ENDPOINT = "https://external.api.recraft.ai/v1/images/generations/vector";
const RECRAFT_VECTOR_MODEL = "recraftv4_1_vector";
const RECRAFT_VECTOR_API_UNITS = 80;

function listToPrompt(items) {
  return Array.isArray(items) && items.length
    ? items.map((item) => String(item).trim()).filter(Boolean).join("; ")
    : "none specified";
}

function buildRecraftVectorPrompt(rawBrief) {
  const brief = normalizeBrief(rawBrief);
  if (!brief) return null;

  return [
    "Create one original, commercially usable vector logo in SVG format.",
    `Exact wordmark: ${brief.brand_name}. Spell it exactly in Latin letters; no extra words, no slogan, no registered-trademark symbol.`,
    `Brand context: ${brief.business_context}.`,
    `Desired feeling: ${listToPrompt(brief.desired_feelings)}.`,
    `Avoid: ${listToPrompt(brief.undesired_feelings)}.`,
    `Non-negotiable requirements: ${listToPrompt(brief.hard_constraints)}.`,
    `Helpful preferences: ${listToPrompt(brief.soft_preferences)}.`,
    "Use a clean, flat, scalable mark with a transparent background. Prioritize legibility at small sizes.",
    "If a symbol plus name is requested, include a distinct simple symbol beside the exact wordmark; do not hide the symbol inside a letter.",
  ].join("\n");
}

function extractGeneratedUrl(payload) {
  const records = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.images)
      ? payload.images
      : [];
  const record = records[0];
  const url = record?.url || record?.image_url || record?.imageUrl;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

async function generateRecraftVectorSmokeTest(rawBrief, { fetchImpl = global.fetch } = {}) {
  const prompt = buildRecraftVectorPrompt(rawBrief);
  if (!prompt) throw new Error("Invalid internal evaluation brief.");

  const apiKey = process.env.RECRAFT_API_TOKEN;
  if (!apiKey) throw new Error("Missing RECRAFT_API_TOKEN in env.");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable.");

  const response = await fetchImpl(RECRAFT_VECTOR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      model: RECRAFT_VECTOR_MODEL,
      n: 1,
      response_format: "url",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Recraft vector API error ${response.status}: ${detail || "no details"}`);
  }

  const payload = await response.json();
  const imageUrl = extractGeneratedUrl(payload);
  if (!imageUrl) throw new Error("Recraft returned no vector URL.");

  return {
    provider_id: "recraft_v4_1_vector",
    model: RECRAFT_VECTOR_MODEL,
    output_type: "svg",
    image_url: imageUrl,
    prompt,
    accounting: {
      user_credits_charged: 0,
      creation_saved: false,
      estimated_recraft_api_units: RECRAFT_VECTOR_API_UNITS,
    },
  };
}

module.exports = {
  RECRAFT_VECTOR_ENDPOINT,
  RECRAFT_VECTOR_MODEL,
  RECRAFT_VECTOR_API_UNITS,
  buildRecraftVectorPrompt,
  generateRecraftVectorSmokeTest,
};

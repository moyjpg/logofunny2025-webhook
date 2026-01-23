const fetch = require("node-fetch");

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_PROMPT_MODEL || "gpt-4o-mini";
  if (!apiKey) return null;
  return { apiKey, model };
}

function shouldUseMagicPrompt(mapped = {}, options = {}) {
  if (options.useMagicPrompt === false) return false;
  if (!getOpenAIConfig()) return false;
  if (mapped?.promptOverride) return false;
  const hasEnough =
    (mapped?.brandName && mapped?.brandName.trim()) &&
    (mapped?.keywords && mapped?.keywords.trim()) &&
    (mapped?.industry && mapped?.industry.trim());
  return !hasEnough;
}

function buildMagicPromptRequest(mapped, basePrompt) {
  const brand = mapped?.brandName || "";
  const keywords = mapped?.keywords || "";
  const industry = mapped?.industry || "";
  const colorTheme = Array.isArray(mapped?.colorTheme)
    ? mapped.colorTheme.join(", ")
    : mapped?.colorTheme || "";
  const notes = mapped?.notes || "";
  const tagline = mapped?.tagline || "";

  return [
    "You are a logo prompt engineer. Write a single concise prompt add-on that improves logo quality.",
    "Return ONLY the add-on prompt, no quotes, no extra text.",
    "Constraints:",
    "- Emphasize logo design (not illustration or photo).",
    "- Keep it short (max 2 sentences).",
    "- Reinforce clarity, strong silhouette, and brand readability.",
    "",
    `Base prompt: ${basePrompt}`,
    `Brand: ${brand}`,
    `Keywords: ${keywords}`,
    `Industry: ${industry}`,
    `Preferred colors: ${colorTheme}`,
    `Tagline: ${tagline}`,
    `Notes: ${notes}`,
  ].join("\n");
}

async function maybeGenerateMagicPrompt(mapped, basePrompt) {
  const cfg = getOpenAIConfig();
  if (!cfg) return null;

  const input = [
    {
      role: "user",
      content: [{ type: "input_text", text: buildMagicPromptRequest(mapped, basePrompt) }],
    },
  ];

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      input,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI magic prompt error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const outputText = data?.output_text || "";
  return outputText.trim();
}

module.exports = {
  maybeGenerateMagicPrompt,
  shouldUseMagicPrompt,
};

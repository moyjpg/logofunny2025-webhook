const fetch = require("node-fetch");

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_JUDGE_MODEL || "gpt-4o";
  if (!apiKey) return null;
  return { apiKey, model };
}

function buildJudgePrompt(context) {
  const brand = context?.brandName || "";
  const keywords = context?.keywords || "";
  const industry = context?.industry || "";
  const colorTheme = Array.isArray(context?.colorTheme)
    ? context.colorTheme.join(", ")
    : context?.colorTheme || "";

  return [
    "You are a strict logo judge. Score the logo from 0-100 using the rubric.",
    "Return ONLY valid JSON with keys:",
    "score (0-100),",
    "breakdown: { brand_consistency, legibility, trademark_viability, originality, simplicity, scalability, versatility, text_rendering, prompt_alignment, image_coherence, composition_balance } (each 0-10),",
    "notes (short string).",
    "",
    `Brand name: ${brand}`,
    `Keywords: ${keywords}`,
    `Industry: ${industry}`,
    `Preferred colors: ${colorTheme}`,
  ].join("\n");
}

async function judgeLogo(imageUrl, context = {}) {
  const cfg = getOpenAIConfig();
  if (!cfg) return null;

  const input = [
    {
      role: "user",
      content: [
        { type: "input_text", text: buildJudgePrompt(context) },
        { type: "input_image", image_url: imageUrl },
      ],
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
      text: { format: { type: "json_object" } },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI judge error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const outputText = data?.output_text || "";

  const jsonMatch = outputText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("OpenAI judge returned no JSON");
  }
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed;
}

module.exports = {
  judgeLogo,
  getOpenAIConfig,
};

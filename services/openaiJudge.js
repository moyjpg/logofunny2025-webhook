const fetch = require("node-fetch");
const sharp = require("sharp");
const { getR2ObjectBuffer } = require("./r2Upload");

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
    "Return ONLY a JSON object (no markdown, no extra text).",
    "Required keys:",
    "score (0-100),",
    "breakdown: { brand_consistency, legibility, trademark_viability, originality, simplicity, scalability, versatility, text_rendering, prompt_alignment, image_coherence, composition_balance } (each 0-10),",
    "notes (short string).",
    "If unsure, still return JSON with best estimates.",
    "",
    `Brand name: ${brand}`,
    `Keywords: ${keywords}`,
    `Industry: ${industry}`,
    `Preferred colors: ${colorTheme}`,
  ].join("\n");
}

function buildResponseSchema() {
  return {
    name: "logo_judge",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["score", "breakdown", "notes"],
      properties: {
        score: { type: "number", minimum: 0, maximum: 100 },
        notes: { type: "string" },
        breakdown: {
          type: "object",
          additionalProperties: false,
          required: [
            "brand_consistency",
            "legibility",
            "trademark_viability",
            "originality",
            "simplicity",
            "scalability",
            "versatility",
            "text_rendering",
            "prompt_alignment",
            "image_coherence",
            "composition_balance",
          ],
          properties: {
            brand_consistency: { type: "number", minimum: 0, maximum: 10 },
            legibility: { type: "number", minimum: 0, maximum: 10 },
            trademark_viability: { type: "number", minimum: 0, maximum: 10 },
            originality: { type: "number", minimum: 0, maximum: 10 },
            simplicity: { type: "number", minimum: 0, maximum: 10 },
            scalability: { type: "number", minimum: 0, maximum: 10 },
            versatility: { type: "number", minimum: 0, maximum: 10 },
            text_rendering: { type: "number", minimum: 0, maximum: 10 },
            prompt_alignment: { type: "number", minimum: 0, maximum: 10 },
            image_coherence: { type: "number", minimum: 0, maximum: 10 },
            composition_balance: { type: "number", minimum: 0, maximum: 10 },
          },
        },
      },
    },
  };
}

async function judgeLogo(imageUrl, context = {}, opts = {}) {
  const cfg = getOpenAIConfig();
  if (!cfg) return null;

  let imageInput = imageUrl;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      throw new Error(`fetch status ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const resized = await sharp(buffer)
      .resize(512, 512, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();
    imageInput = `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch (err) {
    // If fetch/resize fails, try R2 credentials (more reliable than public URL).
    if (opts?.r2Key) {
      try {
        const { buffer } = await getR2ObjectBuffer(opts.r2Key);
        const resized = await sharp(buffer)
          .resize(512, 512, { fit: "inside" })
          .jpeg({ quality: 80 })
          .toBuffer();
        imageInput = `data:image/jpeg;base64,${resized.toString("base64")}`;
      } catch (r2Err) {
        console.warn("[OpenAI judge] R2 fetch failed, using URL:", r2Err?.message || r2Err);
      }
    } else {
      console.warn("[OpenAI judge] image fetch failed, using URL:", err?.message || err);
    }
  }

  const input = [
    {
      role: "user",
      content: [
        { type: "input_text", text: buildJudgePrompt(context) },
        { type: "input_image", image_url: imageInput },
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
      text: { format: { type: "json_schema", name: "logo_judge", json_schema: buildResponseSchema() } },
      temperature: 0,
      max_output_tokens: 300,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI judge error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const outputText = data?.output_text || "";
  try {
    return JSON.parse(outputText);
  } catch (parseErr) {
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (nestedErr) {
        console.warn("[OpenAI judge] JSON parse failed:", nestedErr?.message || nestedErr);
      }
    } else {
      console.warn("[OpenAI judge] JSON missing in response:", outputText.slice(0, 200));
    }
  }
  return null;
}

module.exports = {
  judgeLogo,
  getOpenAIConfig,
};

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
    "You are a strict commercial logo compliance judge.",
    "Analyze the image and return ONLY valid JSON that matches the provided JSON schema.",
    "No markdown, no extra text.",
    "",
    "Scoring:",
    "- score: 0-100 overall commercial logo quality",
    "- breakdown: each 0-10",
    "",
    "Hard rules for violations:",
    "- If ANY human/person/worker/photographer/character/mascot/humanoid appears (even small) => violations.hasPeople = true",
    "- If the image is primarily a scene/illustration rather than a logo => violations.tooIllustrative = true",
    "- If there is a background scene or multiple objects beyond a simple logo mark => violations.hasScene = true",
    "",
    "Violations must be conservative: when unsure, mark the violation as true.",
    "",
    `Brand name: ${brand}`,
    `Keywords: ${keywords}`,
    `Industry: ${industry}`,
    `Preferred colors: ${colorTheme}`,
  ].join("\n");
}

function buildResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["score", "breakdown", "notes", "violations"],
    properties: {
      score: { type: "number", minimum: 0, maximum: 100 },
      notes: { type: "string" },
      violations: {
        type: "object",
        additionalProperties: false,
        required: ["hasPeople", "hasHuman", "hasMascot", "hasScene", "tooIllustrative"],
        properties: {
          hasPeople: { type: "boolean" },
          hasHuman: { type: "boolean" },
          hasMascot: { type: "boolean" },
          hasScene: { type: "boolean" },
          tooIllustrative: { type: "boolean" },
        },
      },
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
  };
}

async function judgeLogo(imageUrl, context = {}, opts = {}) {
  const cfg = getOpenAIConfig();
  if (!cfg) return null;

  // Dev switch: return a deterministic mock judge payload (useful to unblock UI work)
  if (process.env.JUDGE_MOCK === "1") {
    return {
      score: 50,
      notes: "mock_judge_enabled",
      violations: {
        hasPeople: false,
        hasHuman: false,
        hasMascot: false,
        hasScene: false,
        tooIllustrative: false,
      },
      breakdown: {
        brand_consistency: 5,
        legibility: 5,
        trademark_viability: 5,
        originality: 5,
        simplicity: 5,
        scalability: 5,
        versatility: 5,
        text_rendering: 5,
        prompt_alignment: 5,
        image_coherence: 5,
        composition_balance: 5,
      },
    };
  }

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
      text: {
        format: {
          type: "json_schema",
          name: "logo_judge",
          schema: buildResponseSchema(),
          strict: true,
        },
      },
      temperature: 0,
      max_output_tokens: 300,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI judge error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const outputText =
    (typeof data?.output_text === "string" && data.output_text.trim()
      ? data.output_text
      : "") ||
    (() => {
      const output = data?.output;
      if (!Array.isArray(output)) return "";
      for (const item of output) {
        const content = item?.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const text = part?.output_text ?? part?.text;
            if (typeof text === "string" && text.trim()) return text;
          }
        } else if (typeof content === "string" && content.trim()) {
          return content;
        }
      }
      return "";
    })();
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
      const hint =
        data?.id ||
        (Array.isArray(data?.output) ? `output_len=${data.output.length}` : "no_output");
      console.warn("[OpenAI judge] JSON missing in response:", hint);
    }
  }
  return null;
}

module.exports = {
  judgeLogo,
  getOpenAIConfig,
};

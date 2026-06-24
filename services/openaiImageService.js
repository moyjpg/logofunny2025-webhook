const fetch = require("node-fetch");
const { uploadBufferToR2 } = require("./r2Upload");
const {
  planConceptDirections,
  buildMinimalIndustryCue,
  buildPaletteVariationCue,
  detectPetAnimal,
} = require("./ideogramService");

function buildOpenAILogoPrompt(input, conceptKey) {
  const brandName    = String(input?.brandName || "Brand").trim();
  const industryRaw  = String(input?.industry  || "").toLowerCase();
  const industry     = industryRaw.replace(/_/g, " ").trim();
  const keywords     = [
    String(input?.keywords  || ""),
    String(input?.styleCues || ""),
  ].filter(Boolean).join(", ").trim();
  const notes    = String(input?.otherNotes || input?.notes || "").trim();
  const colorDir = String(input?.colorDirection || "").replace(/_/g, " ").trim();

  const searchText   = [brandName, industryRaw, keywords, notes].join(" ").toLowerCase();
  const animalTarget = industryRaw.includes("pet") ? detectPetAnimal(searchText) : "none";

  const directions   = planConceptDirections(industryRaw, animalTarget, brandName, keywords);
  const conceptAngle = directions[conceptKey] || "";

  const industryCue  = buildMinimalIndustryCue(input);
  const paletteCue   = buildPaletteVariationCue(input);

  // Character-by-character spelling anchor — strongest known OpenAI text-accuracy technique.
  const nameChars = brandName.split("").join("-");

  const parts = [
    `Create a professional commercial logo for ${brandName}${industry ? `, a ${industry} brand` : ""}.`,
    "Style: flat vector graphic design, clean and logo-like. Not photorealistic. Not 3D rendered. Not illustrative.",
    "One standalone logo mark on a pure white (#FFFFFF) background only. " +
      "One composition only. " +
      "Do not include ® symbols, ™ symbols, © symbols, or any legal marks. " +
      "Do not create a brand guideline page, style board, multi-panel layout, or color/type specimen. " +
      "Do not add decorative captions, explanatory labels, or descriptors outside the brand name.",
    `Brand name: "${brandName}". Spell it exactly as written, character by character: ${nameChars}. ` +
      "Do not add, remove, or change any letter or space. This is the only text in the logo.",
  ];

  if (conceptAngle) parts.push(`Design direction: ${conceptAngle}`);
  if (industryCue)  parts.push(industryCue);
  if (colorDir)     parts.push(`Color direction: ${colorDir}.`);
  if (paletteCue)   parts.push(paletteCue);
  if (keywords)     parts.push(`Visual cues: ${keywords}.`);
  if (notes)        parts.push(`User notes: ${notes}.`);

  parts.push(
    "The result should look like a finished logo for a real brand — polished, memorable, and suitable for actual use."
  );

  return parts.join(" ");
}

async function generateOpenAILogoConcept(input = {}, conceptKey = "app_icon") {
  if (process.env.LOGOFUNNY_OPENAI_IMAGE_ENABLED !== "true") {
    throw new Error("OpenAI image generation is disabled (set LOGOFUNNY_OPENAI_IMAGE_ENABLED=true to enable)");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in env");
  }

  const quality = process.env.LOGOFUNNY_OPENAI_IMAGE_QUALITY || "medium";
  const prompt  = buildOpenAILogoPrompt(input, conceptKey);

  if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
    console.log("[openai-image] conceptKey=%s quality=%s promptPreview=%j",
      conceptKey, quality, prompt.slice(0, 600));
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality,
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI image API error ${response.status}: ${detail || "no details"}`);
  }

  const data = await response.json();
  const b64  = data?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI returned no image data");
  }

  const buffer = Buffer.from(b64, "base64");
  const { publicUrl } = await uploadBufferToR2(buffer, "image/png", { prefix: "logos" });

  return {
    imageUrl:     publicUrl,
    prompt,
    style_name:   "openai",
    conceptLabel: conceptKey,
    model:        "openai",
    mode:         "text-to-image",
  };
}

module.exports = {
  generateOpenAILogoConcept,
};

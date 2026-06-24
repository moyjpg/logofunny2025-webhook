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

  const brandIntro   = `Create a professional commercial logo for ${brandName}${industry ? `, a ${industry} brand` : ""}.`;
  const nameAnchor   = `Brand name: "${brandName}". Spell it exactly, character by character: ${nameChars}. Do not add, remove, or change any letter or space.`;
  const SAFETY_BLOCK = "Output: one centered logo on a plain white (#FFFFFF) background. No ® ™ © symbols. No multi-panel. No brand board. No extra text beyond the brand name.";

  const optional = [
    industryCue ? industryCue                     : null,
    colorDir    ? `Color direction: ${colorDir}.` : null,
    paletteCue  ? paletteCue                      : null,
    keywords    ? `Visual cues: ${keywords}.`     : null,
    notes       ? `User notes: ${notes}.`         : null,
  ].filter(Boolean);

  const industryLabel = industry || "category";

  let parts;

  if (conceptKey === "wordmark") {
    parts = [
      brandIntro,
      "Style: flat vector logo design.",
      ...(conceptAngle ? [conceptAngle] : []),
      `Design a custom typographic wordmark where the letterforms are the entire logo — no separate symbol or icon. The brand name should look drawn, not typed. One or two characters carry a deliberate design decision: an open counter, a modified terminal, a custom ligature, or adjusted stroke contrast. Letter-spacing feels intentional — not default. The result is a wordmark with genuine typographic personality, specific to ${brandName} and not substitutable by a generic font.`,
      ...optional,
      `${nameAnchor} Every letter correct. This is the entire logo.`,
      SAFETY_BLOCK,
    ];
  } else if (conceptKey === "app_icon") {
    parts = [
      brandIntro,
      "Style: flat vector logo design.",
      ...(conceptAngle ? [conceptAngle] : []),
      `Create a bold standalone symbol mark with the brand name below in clean, readable type. The symbol must have a strong silhouette — one that reads clearly at favicon size (32×32 pixels) and at full size equally well. The mark is original: derived from a specific concept behind ${brandName}, not a generic ${industryLabel} icon. The brand name below is subordinate — clean, legible, and in supporting weight.`,
      ...optional,
      nameAnchor,
      SAFETY_BLOCK,
      "The result should look like a polished app icon system — complete and production-ready.",
    ];
  } else if (conceptKey === "symbol_mark") {
    parts = [
      brandIntro,
      "Style: flat vector logo design.",
      ...(conceptAngle ? [conceptAngle] : []),
      `Create the most inventive mark possible for this brand. Push past obvious ${industryLabel} imagery into something genuinely original — a geometric idea rather than an illustration. The best marks have a concept behind them: a metaphor made geometric, a dual reading, or a form that becomes more interesting the longer you look. Brand name appears below in restrained, clean type — the mark does the creative work. The result should feel specific to ${brandName} and not substitutable for any other brand in the category.`,
      ...optional,
      nameAnchor,
      SAFETY_BLOCK,
      "The result should feel like it was designed by a senior brand designer — original, concept-driven, and memorable.",
    ];
  } else {
    // recommended — complete identity lockup
    parts = [
      brandIntro,
      "Style: flat vector logo design.",
      ...(conceptAngle ? [conceptAngle] : []),
      `Create a complete brand identity lockup: a concept-driven symbol mark paired with the brand name as a wordmark. The symbol is original to this brand — derived from what the brand does or represents, not a generic ${industryLabel} icon. The wordmark sits beside or below the mark with deliberate letter-spacing. The overall composition feels like a finished identity — the kind of logo that would appear in a professional branding case study.`,
      ...optional,
      nameAnchor,
      SAFETY_BLOCK,
      "The result should look like a finished logo for a real brand — polished, memorable, and suitable for actual use.",
    ];
  }

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
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI image API error ${response.status}: ${detail || "no details"}`);
  }

  const data = await response.json();
  const b64  = data?.data?.[0]?.b64_json;
  if (!b64) {
    const availableKeys = JSON.stringify(Object.keys(data?.data?.[0] || {}));
    throw new Error(`OpenAI returned no b64_json image data. Available keys in data[0]: ${availableKeys}`);
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
